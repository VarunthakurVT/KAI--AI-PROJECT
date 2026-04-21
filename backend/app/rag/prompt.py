"""
NEXUS Backend – Prompt Assembly

Constructs the final prompt for the LLM with:
  1. System instruction
  2. Retrieved context (RAG chunks)
  3. Conversation history (sliding window)
  4. Tool instructions (if agent mode)
"""

from typing import List, Dict, Any, Optional
from app.config import settings


def build_context_block(chunks: List[Dict[str, Any]]) -> str:
    """Format retrieved chunks into a context block for the prompt."""
    if not chunks:
        return "No relevant knowledge base context found for this query."

    context_parts = []
    for i, chunk in enumerate(chunks, 1):
        source = chunk.get("source", "unknown")
        score = chunk.get("score", 0.0)
        text = chunk.get("text", "")
        context_parts.append(
            f"[Source {i}: {source} (relevance: {score:.2f})]\n{text}"
        )

    return "\n\n---\n\n".join(context_parts)


def build_messages(
    user_message: str,
    context_chunks: List[Dict[str, Any]],
    conversation_history: List[Dict[str, str]] | None = None,
    tool_instructions: str | None = None,
    system_prompt: str | None = None,
    use_rag: bool = True,
    user_name: str | None = None,
) -> List[Dict[str, str]]:
    """
    Build the full message list for the LLM call.

    Args:
        user_message (str): The current user message
        context_chunks (list): Retrieved context from RAG (ignored if use_rag=False)
        conversation_history (list): Previous messages in conversation
        tool_instructions (str): Optional tool definitions for agent mode
        system_prompt (str): Custom system prompt (overrides default)
        use_rag (bool): If True, use RAG mode with context. If False, use general conversation mode.

    Returns a list of {"role": ..., "content": ...} dicts ready for Groq.
    """
    messages = []

    # 1. System prompt
    if system_prompt:
        sys_prompt = system_prompt
    elif use_rag:
        sys_prompt = settings.RAG_SYSTEM_PROMPT
    else:
        sys_prompt = settings.GENERAL_SYSTEM_PROMPT
    
    # Add user name personalization if provided
    if user_name:
        sys_prompt = f"{sys_prompt}\n\n**Remember: You are talking with {user_name}. Use their name occasionally to make the conversation feel personal and friendly.**"
    
    # Build full system message
    if use_rag and context_chunks:
        context_block = build_context_block(context_chunks)
        full_system = f"""{sys_prompt}

## Retrieved Knowledge Base Context
{context_block}

## Instructions
- Answer based on the context above when relevant.
- If you cite information, reference the [Source N: filename] tag.
- If the context is insufficient, say so honestly and offer to help differently.
- Be concise but thorough. Use markdown formatting for clarity."""
    else:
        full_system = sys_prompt

    if tool_instructions:
        full_system += f"\n\n## Available Tools\n{tool_instructions}"

    messages.append({"role": "system", "content": full_system})

    # 2. Conversation history (sliding window — last 10 messages)
    if conversation_history:
        window = conversation_history[-10:]
        for msg in window:
            messages.append({"role": msg["role"], "content": msg["content"]})

    # 3. Current user message
    messages.append({"role": "user", "content": user_message})

    return messages
