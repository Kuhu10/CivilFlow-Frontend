from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.responses import success
from app.core.config import settings
from app.db.session import get_db
from app.models.user import User
from app.schemas.incident import AIAnalyzeRequest
from app.services.ai_service import analyze_incident, validate_image_bytes

router = APIRouter()


@router.post("/analyze")
def analyze_text(payload: AIAnalyzeRequest, request: Request, user: User = Depends(get_current_user)):
    result = analyze_incident(payload.description)
    return success(request, result)


@router.post("/analyze-image")
def analyze_image(
    request: Request,
    description: str = Form(min_length=10, max_length=5000),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    max_bytes = settings.max_upload_mb * 1024 * 1024
    raw = file.file.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise HTTPException(status_code=413, detail={"code": "IMAGE_TOO_LARGE", "message": f"Image exceeds the {settings.max_upload_mb} MB limit."})
    try:
        mime_type, _, _ = validate_image_bytes(raw)
    except ValueError as exc:
        raise HTTPException(status_code=415, detail={"code": "INVALID_IMAGE", "message": str(exc)}) from exc
    analysis = analyze_incident(description, raw, mime_type)
    analysis.warnings = [*analysis.warnings, "Image analysis is advisory; verify the issue and severity before dispatch."]
    return success(request, analysis)
