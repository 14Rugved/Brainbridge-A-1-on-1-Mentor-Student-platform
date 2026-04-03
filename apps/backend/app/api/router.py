from fastapi import APIRouter

from app.api.routes import auth, health, messages, run, sessions, snapshots

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(sessions.router)
api_router.include_router(messages.router)
api_router.include_router(snapshots.router)
api_router.include_router(run.router)
