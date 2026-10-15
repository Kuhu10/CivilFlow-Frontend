from fastapi import APIRouter

from app.api.v1.endpoints import ai, analytics, auth, incidents, teams

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI triage"])
api_router.include_router(incidents.router, prefix="/incidents", tags=["Incidents"])
api_router.include_router(teams.router, prefix="/teams", tags=["Field teams"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
