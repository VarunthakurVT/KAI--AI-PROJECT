"""
NEXUS Backend – Course API Endpoints

POST /v1/courses      → create a course
GET  /v1/courses      → list user's courses
GET  /v1/courses/{id} → get course details
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.db.session import get_db
from app.db.models import User, Course, Document
from app.schemas.documents import CourseCreate, CourseResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(
    body: CourseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new course."""
    course = Course(
        title=body.title,
        description=body.description,
        owner_user_id=current_user.id,
    )
    db.add(course)
    await db.flush()
    await db.commit()

    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        owner_user_id=course.owner_user_id,
        created_at=course.created_at,
        document_count=0,
    )


@router.get("", response_model=list[CourseResponse])
async def list_courses(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all courses owned by the current user."""
    result = await db.execute(
        select(
            Course,
            func.count(Document.id).label("doc_count"),
        )
        .outerjoin(Document, Document.course_id == Course.id)
        .where(Course.owner_user_id == current_user.id)
        .group_by(Course.id)
        .order_by(Course.created_at.desc())
    )

    courses = []
    for row in result.all():
        course = row[0]
        courses.append(CourseResponse(
            id=course.id,
            title=course.title,
            description=course.description,
            owner_user_id=course.owner_user_id,
            created_at=course.created_at,
            document_count=row[1],
        ))

    return courses


@router.get("/{course_id}", response_model=CourseResponse)
async def get_course(
    course_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific course by ID."""
    result = await db.execute(
        select(
            Course,
            func.count(Document.id).label("doc_count"),
        )
        .outerjoin(Document, Document.course_id == Course.id)
        .where(Course.id == course_id, Course.owner_user_id == current_user.id)
        .group_by(Course.id)
    )

    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    course = row[0]
    return CourseResponse(
        id=course.id,
        title=course.title,
        description=course.description,
        owner_user_id=course.owner_user_id,
        created_at=course.created_at,
        document_count=row[1],
    )
