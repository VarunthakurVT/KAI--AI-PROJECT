"""
NEXUS Backend – FastAPI Application Bootstrap

Main entry point. Configures middleware, CORS, rate limiting, and mounts routers.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.api.v1.router import router as v1_router

import structlog
import uuid
import time

# ── Structured logging ──
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(0),
)

logger = structlog.get_logger()


# ── Rate limiter ──
limiter = Limiter(key_func=get_remote_address)


# ── Lifespan ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown events."""
    logger.info("nexus_starting", env=settings.APP_ENV)
    yield
    logger.info("nexus_shutting_down")


# ── App ──
app = FastAPI(
    title="NEXUS – Adaptive Learning System API",
    description="Backend API for the NEXUS learning platform with RAG, LLM chat, and agent tools.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request ID & Logging Middleware ──
@app.middleware("http")
async def request_logging_middleware(request: Request, call_next):
    """Attach a unique request ID and log request/response details."""
    request_id = str(uuid.uuid4())[:8]
    start_time = time.time()

    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)

    logger.info(
        "request_start",
        method=request.method,
        path=request.url.path,
    )

    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)

    logger.info(
        "request_end",
        status=response.status_code,
        duration_ms=duration_ms,
    )

    response.headers["X-Request-ID"] = request_id
    return response


# ── Mount routers ──
app.include_router(v1_router)


# ── Health check ──
@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy", "service": "nexus-backend", "version": "1.0.0"}


@app.get("/", tags=["Health"])
async def root():
    return {
        "service": "NEXUS Backend API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.APP_DEBUG,
        log_level="info",
    )
