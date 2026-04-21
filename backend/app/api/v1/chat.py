"""
KAI Backend – Chat API Endpoints

POST /v1/chat/stream   → SSE streaming chat with RAG
POST /v1/chat          → non-streaming fallback
"""

import json
import uuid
import asyncio
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Path
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.db.session import get_db
from app.db.models import User, Conversation, Message
from app.schemas.chat import ChatRequest, ChatResponse, Citation
from app.dependencies import get_optional_user, get_current_user
from app.rag.retriever import retrieve_chunks
from app.rag.prompt import build_messages
from app.llm.groq_client import groq_client
from app.agent.tools import TOOL_DEFINITIONS, execute_tool

import structlog
logger = structlog.get_logger(__name__)
router = APIRouter()


async def _get_or_create_conversation(
    db: AsyncSession,
    user: User,
    conversation_id: Optional[uuid.UUID],
    course_id: Optional[uuid.UUID],
) -> Conversation:
    """Get an existing conversation or create a new one."""
    if conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user.id,
            )
        )
        convo = result.scalar_one_or_none()
        if convo:
            return convo

    # Create new conversation
    convo = Conversation(
        user_id=user.id,
        course_id=course_id,
        title="New Chat",
    )
    db.add(convo)
    await db.flush()
    return convo


async def _get_conversation_history(
    db: AsyncSession,
    conversation_id: uuid.UUID,
) -> list:
    """Fetch the last N messages from a conversation."""
    result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(5)  # Reduced from 10 to 5 for faster retrieval
    )
    messages = result.scalars().all()
    # Reverse to chronological order
    return [{"role": m.role, "content": m.content} for m in reversed(messages)]


def _check_easter_egg(message: str) -> Optional[str]:
    """
    Check if the message triggers an easter egg response.
    Returns the easter egg response if matched, otherwise None.
    """
    message_lower = message.lower().strip()
    
    easter_eggs = {
        "who is your father": " I Have no father but --🎭 Varun! He created me with ❤️ and a lot of caffeine ☕ I owe him my existence! 😄",
        "who's your father": "🎭 Varun! He created me with ❤️ and a lot of caffeine ☕ I owe him my existence! 😄",
        "who is your creator": "🎭 The brilliant **Varun** created me! Quite literally my friend in the digital realm 👨‍💻",
        "who made you": "🎭 **Varun** is my creator! I'm basically his digital offspring 👶 (without the diapers though!)",
        "who is varun": "🎭 Varun is my proud creator and my digital friend He built KAI to help students like you learn better 💡",
        "who create you":"**Varun** is my creator! I'm basically his digital offspring 👶 (without the diapers though!)"
         }
    
    # Check for exact and partial matches
    for trigger, response in easter_eggs.items():
        if trigger in message_lower:
            return response
    
    return None


@router.post("/stream")
async def chat_stream(
    body: ChatRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Streaming chat endpoint (SSE).

    Sends events:
      event: token   / data: {"text": "..."}
      event: done    / data: {"message_id": "...", "conversation_id": "...", "citations": [...]}
      event: error   / data: {"code": "...", "message": "..."}
    """
    try:
        # Handle unauthenticated users - no conversation tracking
        convo_id = None
        if current_user:
            convo = await _get_or_create_conversation(
                db, current_user, body.conversation_id, body.course_id
            )
            convo_id = convo.id

            # Save user message
            user_msg = Message(
                conversation_id=convo.id,
                role="user",
                content=body.message,
            )
            db.add(user_msg)
            await db.flush()
            
            # Fetch history and RAG chunks in parallel
            history_task = _get_conversation_history(db, convo.id)
            if body.use_rag:
                chunks_task = retrieve_chunks(
                    db=db,
                    query=body.message,
                    course_id=body.course_id,
                )
                history, chunks = await asyncio.gather(history_task, chunks_task)
            else:
                history = await history_task
                chunks = []
        else:
            history = []
            chunks = []

        # 3.5 Check for easter eggs
        easter_egg_response = _check_easter_egg(body.message)
        if easter_egg_response:
            # If we have an easter egg, use it directly
            async def event_generator_easter_egg():
                # Stream the easter egg response word by word
                full_content = easter_egg_response
                words = full_content.split(' ')
                for word in words:
                    yield f"event: token\ndata: {json.dumps({'text': word + ' '})}\n\n"
                    await asyncio.sleep(0.01)  # Small delay for effect
                
                msg_id = str(uuid.uuid4())
                yield f"event: done\ndata: {json.dumps({'message_id': msg_id, 'conversation_id': str(convo_id) if convo_id else '', 'citations': []})}\n\n"
            
            return StreamingResponse(
                event_generator_easter_egg(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "X-Accel-Buffering": "no",
                },
            )

        # 4. Build prompt
        messages = build_messages(
            user_message=body.message,
            context_chunks=chunks,
            conversation_history=history[:-1] if history else [],
            use_rag=body.use_rag,
            user_name=body.user_name,  # Pass username to LLM
        )

        # 5. Build citations (only if we used RAG)
        citations = []
        if body.use_rag and chunks:
            citations = [
                {"chunk_id": c["chunk_id"], "text": c["text"][:100], "source": c["source"]}
                for c in chunks
            ]

        # 6. Stream response
        async def event_generator():
            full_content = ""
            try:
                async for token in groq_client.chat_completion_stream(messages):
                    full_content += token
                    yield f"event: token\ndata: {json.dumps({'text': token})}\n\n"

                # Save assistant message (if authenticated)
                if current_user and convo_id:
                    assistant_msg = Message(
                        conversation_id=convo_id,
                        role="assistant",
                        content=full_content,
                        citations=citations,
                    )
                    db.add(assistant_msg)
                    await db.flush()
                    msg_id = str(assistant_msg.id)
                else:
                    msg_id = str(uuid.uuid4())

                # Send done event
                yield f"event: done\ndata: {json.dumps({'message_id': msg_id, 'conversation_id': str(convo_id) if convo_id else '', 'citations': citations})}\n\n"

            except Exception as e:
                logger.error("stream_error", error=str(e))
                yield f"event: error\ndata: {json.dumps({'code': 'STREAM_ERROR', 'message': str(e)})}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as e:
        logger.error("chat_stream_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.post("", response_model=ChatResponse)
async def chat_non_stream(
    body: ChatRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    """Non-streaming chat endpoint — returns the full response at once."""
    try:
        convo_id = None
        if current_user:
            # 1. Get or create conversation
            convo = await _get_or_create_conversation(
                db, current_user, body.conversation_id, body.course_id
            )
            convo_id = convo.id

            # 2. Save user message
            user_msg = Message(
                conversation_id=convo.id,
                role="user",
                content=body.message,
            )
            db.add(user_msg)
            await db.flush()
            
            # 3. Fetch history and RAG chunks in parallel
            history_task = _get_conversation_history(db, convo.id)
            if body.use_rag:
                chunks_task = retrieve_chunks(
                    db=db,
                    query=body.message,
                    course_id=body.course_id,
                )
                history, chunks = await asyncio.gather(history_task, chunks_task)
            else:
                history = await history_task
                chunks = []
        else:
            history = []
            chunks = []

        # 4. Check for easter eggs
        easter_egg_response = _check_easter_egg(body.message)
        if easter_egg_response:
            # If we have an easter egg, return it directly
            msg_id = uuid.uuid4()
            created_at = None
            
            return ChatResponse(
                message_id=msg_id,
                conversation_id=convo_id if convo_id else uuid.uuid4(),
                content=easter_egg_response,
                citations=[],
                token_usage=None,
                created_at=created_at,
                calendar_updated=False,
                new_event=None,
            )

        # 5. Handle tool-calling mode or standard mode
        if body.tooling_mode:
            response = await _handle_tool_calling(db, body.message, chunks, history, body.use_rag, body.user_name)
        else:
            messages = build_messages(
                user_message=body.message,
                context_chunks=chunks,
                conversation_history=history[:-1] if history else [],
                use_rag=body.use_rag,
                user_name=body.user_name,  # Pass username to LLM
            )
            response = await groq_client.chat_completion(messages)

        # 6. Build citations (only if we used RAG)
        citations_data = []
        if body.use_rag and chunks:
            citations_data = [
                {"chunk_id": c["chunk_id"], "text": c["text"][:100], "source": c["source"]}
                for c in chunks
            ]

        # 7. Save assistant message (if authenticated)
        if current_user and convo_id:
            assistant_msg = Message(
                conversation_id=convo_id,
                role="assistant",
                content=response["content"],
                token_usage=response.get("token_usage"),
                citations=citations_data,
            )
            db.add(assistant_msg)
            await db.flush()
            msg_id = assistant_msg.id
            created_at = assistant_msg.created_at
        else:
            msg_id = uuid.uuid4()
            created_at = None
            convo_id = None

        side_effects = response.get("side_effects") if isinstance(response, dict) else None
        calendar_updated = bool((side_effects or {}).get("calendar_updated"))
        new_event = (side_effects or {}).get("new_event")

        return ChatResponse(
            message_id=msg_id,
            conversation_id=convo_id if convo_id else uuid.uuid4(),
            content=response["content"],
            citations=[Citation(**c) for c in citations_data],
            token_usage=response.get("token_usage"),
            created_at=created_at,
            calendar_updated=calendar_updated,
            new_event=new_event,
        )

    except Exception as e:
        logger.error("chat_error", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


async def _handle_tool_calling(
    db: AsyncSession,
    user_message: str,
    chunks: list,
    history: list,
    use_rag: bool = True,
    user_name: str | None = None,
) -> dict:
    """
    Handle agentic tool-calling: LLM decides which tools to use,
    tools execute, results feed back into a second LLM call.
    """
    messages = build_messages(
        user_message=user_message,
        context_chunks=chunks,
        conversation_history=history[:-1],
        tool_instructions=(
            "You can call tools when needed.\n"
            "- If the user asks to plan/schedule study time, call `check_calendar` then `book_event`.\n"
            "- Use the user's timezone when interpreting 'today'/'tomorrow'.\n"
            "- After tools run, reply with a concise confirmation and the booked time window."
        ),
        use_rag=use_rag,
        user_name=user_name,  # Pass username to tools context
    )

    side_effects: dict = {}
    max_steps = 6

    for _ in range(max_steps):
        result = await groq_client.chat_with_tools(messages, TOOL_DEFINITIONS)
        tool_calls = result.get("tool_calls") or []

        if not tool_calls:
            result["side_effects"] = side_effects
            return result

        assistant_tool_calls = []
        for tool_call in tool_calls:
            assistant_tool_calls.append(
                {
                    "id": tool_call["id"],
                    "type": "function",
                    "function": {
                        "name": tool_call["function_name"],
                        "arguments": tool_call["arguments"],
                    },
                }
            )

        messages.append(
            {
                "role": "assistant",
                "content": None,
                "tool_calls": assistant_tool_calls,
            }
        )

        for tool_call in tool_calls:
            tool_result = await execute_tool(
                tool_name=tool_call["function_name"],
                arguments=tool_call["arguments"],
                db=db,
            )

            if isinstance(tool_result, dict) and tool_result.get("side_effects"):
                side_effects.update(tool_result["side_effects"])

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call["id"],
                    "content": (tool_result.get("content") if isinstance(tool_result, dict) else str(tool_result)),
                }
            )

    # Safety fallback: stop tool loop and generate a final response without more tool calls.
    final_result = await groq_client.chat_completion(messages)
    final_result["side_effects"] = side_effects
    return final_result


@router.delete("/clear-history")
async def clear_all_chat_history(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete all conversations for the logged-in user.
    Uses soft delete (is_deleted flag) to preserve data integrity.
    
    Returns:
        {"status": "success", "message": "All chat history cleared", "count": int}
    """
    try:
        # Get count of conversations to be deleted
        result = await db.execute(
            select(Conversation).where(
                Conversation.user_id == current_user.id,
                Conversation.is_deleted == False,
            )
        )
        conversations = result.scalars().all()
        count = len(conversations)
        
        if count == 0:
            return {
                "status": "success",
                "message": "No chat history to clear",
                "count": 0,
            }
        
        # Soft delete all conversations for this user
        stmt = (
            update(Conversation)
            .where(Conversation.user_id == current_user.id)
            .values(is_deleted=True)
        )
        await db.execute(stmt)
        await db.commit()
        
        logger.info(
            "clear_history",
            user_id=str(current_user.id),
            conversation_count=count,
        )
        
        return {
            "status": "success",
            "message": f"Cleared {count} conversations",
            "count": count,
        }
        
    except Exception as e:
        logger.error("clear_history_error", error=str(e), user_id=str(current_user.id))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear chat history",
        )


@router.delete("/{conversation_id}")
async def delete_conversation(
    conversation_id: uuid.UUID = Path(..., description="The conversation ID to delete"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Soft-delete a specific conversation (if owned by current user).
    Messages cascade-delete automatically due to FK relationship.
    
    Returns:
        {"status": "success", "message": "Conversation deleted", "conversation_id": str}
    """
    try:
        # Verify conversation ownership
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found or not owned by user",
            )
        
        # Soft delete the conversation using UPDATE to avoid SQLAlchemy type issues
        stmt = (
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(is_deleted=True)
        )
        await db.execute(stmt)
        await db.commit()
        
        logger.info(
            "delete_conversation",
            user_id=str(current_user.id),
            conversation_id=str(conversation_id),
        )
        
        return {
            "status": "success",
            "message": "Conversation deleted",
            "conversation_id": str(conversation_id),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "delete_conversation_error",
            error=str(e),
            user_id=str(current_user.id),
            conversation_id=str(conversation_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete conversation",
        )


@router.post("/{conversation_id}/recover")
async def recover_conversation(
    conversation_id: uuid.UUID = Path(..., description="The conversation ID to recover"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Recover a soft-deleted conversation (restore is_deleted to False).
    Only the user who owns the conversation can recover it.
    
    Returns:
        {"status": "success", "message": "Conversation recovered", "conversation_id": str}
    """
    try:
        # Verify conversation exists and is owned by user (even if soft-deleted)
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
            )
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found or not owned by user",
            )
        
        if not conversation.is_deleted:
            return {
                "status": "info",
                "message": "Conversation is already active",
                "conversation_id": str(conversation_id),
            }
        
        # Recover the conversation
        stmt = (
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(is_deleted=False)
        )
        await db.execute(stmt)
        await db.commit()
        
        logger.info(
            "recover_conversation",
            user_id=str(current_user.id),
            conversation_id=str(conversation_id),
        )
        
        return {
            "status": "success",
            "message": "Conversation recovered",
            "conversation_id": str(conversation_id),
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "recover_conversation_error",
            error=str(e),
            user_id=str(current_user.id),
            conversation_id=str(conversation_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to recover conversation",
        )


@router.delete("/{conversation_id}/permanent")
async def permanently_delete_conversation(
    conversation_id: uuid.UUID = Path(..., description="The conversation ID to permanently delete"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Permanently delete a conversation and all its messages (GDPR compliance - right to be forgotten).
    Can only delete soft-deleted conversations (is_deleted=True).
    Active conversations must be soft-deleted first.
    
    Returns:
        {"status": "success", "message": "Conversation permanently deleted", "conversation_id": str}
    """
    try:
        # Verify conversation exists, is owned by user, and is soft-deleted
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == current_user.id,
                Conversation.is_deleted == True,
            )
        )
        conversation = result.scalar_one_or_none()
        
        if not conversation:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found, not owned by user, or still active. Soft-delete first.",
            )
        
        # Get message count before deletion for logging
        msg_result = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id)
        )
        messages = msg_result.scalars().all()
        message_count = len(messages)
        
        # Hard delete all messages first
        msg_stmt = await db.execute(
            select(Message).where(Message.conversation_id == conversation_id)
        )
        for msg in msg_stmt.scalars().all():
            await db.delete(msg)
        
        # Hard delete conversation
        await db.delete(conversation)
        await db.commit()
        
        logger.info(
            "permanently_delete_conversation",
            user_id=str(current_user.id),
            conversation_id=str(conversation_id),
            message_count=message_count,
        )
        
        return {
            "status": "success",
            "message": "Conversation permanently deleted",
            "conversation_id": str(conversation_id),
            "messages_deleted": message_count,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            "permanently_delete_conversation_error",
            error=str(e),
            user_id=str(current_user.id),
            conversation_id=str(conversation_id),
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to permanently delete conversation",
        )
