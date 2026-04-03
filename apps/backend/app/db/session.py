from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import get_settings

settings = get_settings()

# Supabase transaction pooler (PgBouncer) compatibility:
# - disable SQLAlchemy asyncpg prepared statement cache
# - use unique statement names
# - avoid pooling at SQLAlchemy layer
_db_url = settings.database_url
_use_pgbouncer_mode = "pooler.supabase.com" in _db_url or ":6543" in _db_url

engine_kwargs: dict = {
    "echo": settings.app_env == "development",
    "future": True,
}

if _use_pgbouncer_mode:
    engine_kwargs["poolclass"] = NullPool
    engine_kwargs["connect_args"] = {
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        "statement_cache_size": 0,
    }

engine = create_async_engine(_db_url, **engine_kwargs)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
