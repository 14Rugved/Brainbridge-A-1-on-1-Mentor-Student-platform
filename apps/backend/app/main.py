from contextlib import asynccontextmanager

import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import get_settings
from app.db.base import Base
from app.db.session import engine
from app.realtime.socket import create_socket_server

settings = get_settings()
sio = create_socket_server()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Only try to create tables if we have a valid database_url
    # And handle errors gracefully to avoid the "Status 3" crash on Render
    if settings.auto_create_tables and settings.database_url:
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        except Exception as e:
            print(f"DATABASE WARNING: Could not auto-create tables: {e}")
            # We don't raise the error here so the app can at least start
    yield


api_app = FastAPI(
    title=settings.app_name,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

api_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@api_app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


api_app.include_router(api_router, prefix=settings.api_v1_prefix)

app = socketio.ASGIApp(
    socketio_server=sio,
    other_asgi_app=api_app,
    socketio_path=settings.socketio_path,
)
