"""
NEXUS Backend – Database Session & Engine

Async SQLAlchemy setup for PostgreSQL with SQLite fallback.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import settings
import os


# ── Determine database URL ──
def _get_database_url() -> str:
    """
    Get database URL. In development mode, if PostgreSQL is not available,
    fall back to SQLite for quick testing.
    """
    db_url = settings.DATABASE_URL
    
    # If in development and using localhost PostgreSQL, check if we should use SQLite
    if settings.APP_ENV == "development" and "localhost" in db_url and "postgresql" in db_url:
        # Use SQLite for faster development/testing
        db_path = os.path.join(os.path.dirname(__file__), "..", "..", "nexus_dev.db")
        return f"sqlite+aiosqlite:///{db_path}"
    
    return db_url


# ── Engine ──
engine = create_async_engine(
    _get_database_url(),
    echo=settings.APP_DEBUG,
    pool_size=20 if "postgresql" in settings.DATABASE_URL else 5,
    max_overflow=10 if "postgresql" in settings.DATABASE_URL else 0,
    pool_pre_ping=True if "postgresql" in settings.DATABASE_URL else False,
    connect_args={"timeout": 10} if "sqlite" in _get_database_url() else {},
)

# ── Session factory ──
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base model ──
class Base(DeclarativeBase):
    pass


# ── Dependency ──
async def get_db() -> AsyncSession:
    """FastAPI dependency — yields an async database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
