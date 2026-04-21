"""
NEXUS Backend – V1 API Router

Aggregates all v1 sub-routers.
"""

from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.chat import router as chat_router
from app.api.v1.courses import router as courses_router
from app.api.v1.documents import router as documents_router
from app.api.v1.examiner import router as examiner_router
from app.api.v1.scribe import router as scribe_router
from app.api.v1.progress import router as progress_router

router = APIRouter(prefix="/v1")

router.include_router(auth_router, prefix="/auth", tags=["Auth"])
router.include_router(chat_router, prefix="/chat", tags=["Chat"])
router.include_router(courses_router, prefix="/courses", tags=["Courses"])
router.include_router(documents_router, prefix="/documents", tags=["Documents"])
router.include_router(examiner_router, prefix="/examiner", tags=["Examiner"])
router.include_router(scribe_router, prefix="/scribe", tags=["Scribe"])
router.include_router(progress_router, prefix="/progress", tags=["Progress"])
