import logging
import re
import uuid

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette import status

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import engine

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("civicflow.api")

app = FastAPI(
    title=settings.app_name,
    description=(
        "Backend API for CivicFlow: civic incident intake, AI-assisted triage, work-order assignment, "
        "evidence-backed closure verification, audit history, and operational analytics. "
        "AI suggestions are decision support and require human review."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    supplied = request.headers.get("X-Request-ID", "")
    request_id = supplied if re.fullmatch(r"[A-Za-z0-9._:-]{1,64}", supplied) else str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def _error(request: Request, code: str, message: str, status_code: int, details=None):
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message, "details": details}, "meta": {"request_id": getattr(request.state, "request_id", "unknown")}},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    detail = exc.detail
    if isinstance(detail, dict):
        code = detail.get("code", "HTTP_ERROR")
        message = detail.get("message", "The request could not be completed.")
        extra = {key: value for key, value in detail.items() if key not in {"code", "message"}}
        details = extra or None
    else:
        code = "HTTP_ERROR"
        message = str(detail)
        details = None
    return _error(request, code, message, exc.status_code, details)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    details = [{"location": list(item.get("loc", [])), "message": item.get("msg", "Invalid value"), "type": item.get("type", "value_error")} for item in exc.errors()]
    return _error(request, "VALIDATION_ERROR", "Request validation failed.", status.HTTP_422_UNPROCESSABLE_ENTITY, details)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled API exception", extra={"request_id": getattr(request.state, "request_id", "unknown"), "error_type": type(exc).__name__})
    return _error(request, "INTERNAL_ERROR", "An unexpected server error occurred.", status.HTTP_500_INTERNAL_SERVER_ERROR)


@app.get("/health/live", tags=["Health"])
def live():
    return {"status": "ok", "service": "civicflow-api"}


@app.get("/health/ready", tags=["Health"])
def ready():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("Readiness probe failed", extra={"error_type": type(exc).__name__})
        return JSONResponse(status_code=503, content={"status": "not_ready", "database": "unavailable"})
    return {"status": "ready", "database": "connected"}


app.include_router(api_router, prefix=settings.api_v1_prefix)
