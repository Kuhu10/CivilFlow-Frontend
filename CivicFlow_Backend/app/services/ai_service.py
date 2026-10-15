import base64
import logging
import re

import httpx
from io import BytesIO

from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.schemas.incident import IncidentAnalysis

logger = logging.getLogger(__name__)

CATEGORY_DEPARTMENT = {
    "Road Damage": "Roads & Infrastructure",
    "Waste Overflow": "Waste Management",
    "Streetlight Outage": "Street Lighting",
    "Drainage Issue": "Drainage",
    "Water Supply": "Water Supply",
    "Park Maintenance": "Parks & Public Spaces",
    "Public Safety": "Public Safety",
    "Other / Needs Review": "Other / Needs Review",
}


def _contains(text: str, words: tuple[str, ...]) -> bool:
    return any(word in text for word in words)


def rules_based_analysis(description: str) -> IncidentAnalysis:
    """Deterministic fallback. It is deliberately labelled as rules, not as generative AI."""
    text = re.sub(r"\s+", " ", description.strip()).lower()
    if _contains(text, ("garbage", "waste", "litter", "rubbish", "overflowing bin", "dumped trash", "dumping")):
        category = "Waste Overflow"
    elif _contains(text, ("streetlight", "street light", "lamp post", "street lamp", "lights are out", "dark walkway")):
        category = "Streetlight Outage"
    elif _contains(text, ("drain", "waterlogging", "water logged", "flooding", "blocked sewer", "sewer overflow")):
        category = "Drainage Issue"
    elif _contains(text, ("water supply", "water pipe", "pipe leak", "leaking pipe", "no water", "water leakage")):
        category = "Water Supply"
    elif _contains(text, ("park", "bench", "playground", "public garden", "broken swing")):
        category = "Park Maintenance"
    elif _contains(text, ("fire", "collision", "road accident", "violence", "assault", "electrical sparks", "exposed wire")):
        category = "Public Safety"
    elif _contains(text, ("pothole", "road", "footpath", "pavement", "sidewalk", "manhole", "road damage", "cracked surface")):
        category = "Road Damage"
    else:
        category = "Other / Needs Review"

    critical_terms = ("injury", "injured", "fire", "accident", "exposed wire", "open manhole", "moving traffic", "life threatening")
    high_terms = ("blocked road", "overflow", "flooding", "school crossing", "hospital", "deep pothole", "electric shock")
    safety_risk = _contains(text, critical_terms + high_terms + ("dangerous", "hazard", "trip hazard", "near traffic"))
    if _contains(text, critical_terms):
        severity = "critical"
    elif _contains(text, high_terms) or safety_risk:
        severity = "high"
    elif _contains(text, ("minor", "small", "cosmetic", "slightly")):
        severity = "low"
    else:
        severity = "medium"

    short = description.strip().rstrip(".!?")
    title = short if len(short) <= 70 else short[:67].rstrip() + "..."
    department = CATEGORY_DEPARTMENT[category]
    action_by_category = {
        "Road Damage": "Inspect the location, secure the immediate hazard if required, and create a repair work order.",
        "Waste Overflow": "Arrange a site check and collection; record whether the public path or roadway is obstructed.",
        "Streetlight Outage": "Inspect the affected lights and electrical supply; prioritize dark pedestrian routes.",
        "Drainage Issue": "Inspect the drain and standing water, then dispatch the appropriate drainage crew.",
        "Water Supply": "Inspect for leakage or supply interruption and isolate the affected infrastructure if necessary.",
        "Park Maintenance": "Inspect the asset and schedule a repair or maintenance visit.",
        "Public Safety": "Refer for prompt human assessment and follow the applicable emergency escalation procedure.",
        "Other / Needs Review": "Have a municipal operator review and classify the report before dispatch.",
    }
    tags = [category.lower().replace(" ", "-")]
    if safety_risk:
        tags.append("safety-review")
    return IncidentAnalysis(
        suggested_title=title,
        summary=short[:450],
        category=category,
        department=department,
        severity=severity,
        safety_risk=safety_risk,
        recommended_action=action_by_category[category],
        rationale="Classification was produced by deterministic keyword rules; a municipal operator should validate severity and assignment.",
        tags=tags,
        provider="rules",
        warnings=["Rules-based classification is a fallback and is not a real AI model result."],
    )


def _gemini_analysis(description: str, image_bytes: bytes | None = None, image_mime_type: str | None = None) -> IncidentAnalysis:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = (
        "You assist a municipal civic-service triage team in Chandigarh, India. "
        "Classify the reported civic issue using only the provided report and optional photo. "
        "Do not infer a person's identity, exact number of affected residents, or hidden facts. "
        "Do not claim an issue is verified, resolved, or an emergency service has been contacted. "
        "Use conservative severity; flag safety risks for human review. Recommend a practical next action. "
        "Approved categories and departments are: Road Damage / Roads & Infrastructure; "
        "Waste Overflow / Waste Management; Streetlight Outage / Street Lighting; "
        "Drainage Issue / Drainage; Water Supply / Water Supply; Park Maintenance / Parks & Public Spaces; "
        "Public Safety / Public Safety; Other / Needs Review / Other / Needs Review. "
        "Return only the requested structured fields.\n\n"
        f"Citizen report: {description}"
    )
    contents: list[object] = [prompt]
    if image_bytes is not None and image_mime_type:
        contents.append(types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type))
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=IncidentAnalysis,
            temperature=0.2,
        ),
    )
    parsed = getattr(response, "parsed", None)
    if isinstance(parsed, IncidentAnalysis):
        analysis = parsed
    elif parsed is not None:
        analysis = IncidentAnalysis.model_validate(parsed)
    else:
        text = getattr(response, "text", None)
        if not text:
            raise ValueError("Gemini returned an empty response")
        analysis = IncidentAnalysis.model_validate_json(text)
    return analysis.model_copy(update={"provider": "gemini", "warnings": [], "department": CATEGORY_DEPARTMENT[analysis.category]})


def _ollama_analysis(description: str, image_bytes: bytes | None = None) -> IncidentAnalysis:
    prompt = (
        "You assist a municipal civic-service triage team in Chandigarh, India. "
        "Classify the report using only its text and optional image. Do not invent the affected population, "
        "claim an issue is verified or resolved, or claim an emergency service was contacted. "
        "Use only these category/department pairs: Road Damage / Roads & Infrastructure; "
        "Waste Overflow / Waste Management; Streetlight Outage / Street Lighting; Drainage Issue / Drainage; "
        "Water Supply / Water Supply; Park Maintenance / Parks & Public Spaces; Public Safety / Public Safety; "
        "Other / Needs Review / Other / Needs Review. Use severity low, medium, high, or critical. "
        "Flag safety concerns conservatively and give a concise recommended next action.\n\n"
        f"Citizen report: {description}\nReturn JSON matching the supplied schema."
    )
    payload: dict[str, object] = {
        "model": settings.ollama_model,
        "prompt": prompt,
        "stream": False,
        "format": IncidentAnalysis.model_json_schema(),
        "options": {"temperature": 0.2},
        "keep_alive": "5m",
    }
    if image_bytes is not None:
        payload["images"] = [base64.b64encode(image_bytes).decode("ascii")]
    url = settings.ollama_base_url.rstrip("/") + "/api/generate"
    with httpx.Client(timeout=settings.ollama_timeout_seconds) as client:
        response = client.post(url, json=payload)
        response.raise_for_status()
    body = response.json()
    result_text = body.get("response")
    if not result_text:
        raise ValueError("Ollama returned an empty response")
    analysis = IncidentAnalysis.model_validate_json(result_text)
    return analysis.model_copy(update={"provider": "ollama", "warnings": ["Open-weight model output is advisory; confirm severity and department before dispatch."], "department": CATEGORY_DEPARTMENT[analysis.category]})


def analyze_incident(
    description: str,
    image_bytes: bytes | None = None,
    image_mime_type: str | None = None,
) -> IncidentAnalysis:
    provider = settings.ai_provider.lower()
    if provider == "rules":
        return rules_based_analysis(description)
    if provider == "ollama":
        try:
            return _ollama_analysis(description, image_bytes)
        except Exception as exc:
            logger.exception("Ollama analysis failed; using deterministic fallback", extra={"error_type": type(exc).__name__})
            fallback = rules_based_analysis(description)
            fallback.provider = "rules_fallback"
            fallback.warnings = [f"Ollama analysis failed ({type(exc).__name__}); deterministic fallback rules were used."]
            return fallback
    if provider == "auto" and not settings.gemini_api_key:
        fallback = rules_based_analysis(description)
        fallback.provider = "rules_fallback"
        fallback.warnings = ["No GEMINI_API_KEY was configured and AI_PROVIDER is auto; deterministic rules were used. Set AI_PROVIDER=ollama to use a configured local Ollama model."]
        return fallback
    if not settings.gemini_api_key:
        fallback = rules_based_analysis(description)
        fallback.provider = "rules_fallback"
        fallback.warnings = ["GEMINI_API_KEY is not configured; deterministic fallback rules were used."]
        return fallback
    try:
        return _gemini_analysis(description, image_bytes, image_mime_type)
    except Exception as exc:  # Preserve API availability, but make the downgrade visible.
        logger.exception("Gemini analysis failed; using deterministic fallback", extra={"error_type": type(exc).__name__})
        fallback = rules_based_analysis(description)
        fallback.provider = "rules_fallback"
        fallback.warnings = [f"Gemini analysis failed ({type(exc).__name__}); deterministic fallback rules were used."]
        return fallback


def validate_image_bytes(raw: bytes) -> tuple[str, int, int]:
    try:
        image = Image.open(BytesIO(raw))
        image.verify()
        image = Image.open(BytesIO(raw))
        image_format = (image.format or "").upper()
        supported = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
        if image_format not in supported:
            raise ValueError("Only JPEG, PNG, and WebP images are accepted")
        width, height = image.size
        if width > 12000 or height > 12000 or width * height > 40_000_000:
            raise ValueError("Image dimensions exceed the supported limit")
        return supported[image_format], width, height
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("Uploaded file is not a valid image") from exc
