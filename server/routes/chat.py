"""Chat API — send message + SSE streaming response."""
import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Conversation, Message
from services.llm import chat_stream, _resolve_api_key
from services.skill import load_skill, build_system_prompt
from services.memory import build_context

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/send")
def send_message(conversation_id: int, content: str, db: Session = Depends(get_db)):
    """Send a user message. Returns streaming assistant reply via SSE."""
    conv = db.query(Conversation).filter(
        Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message
    user_msg = Message(conversation_id=conv.id, role="user", content=content)
    db.add(user_msg)
    db.commit()

    # Check API key
    api_key = _resolve_api_key(db)
    if not api_key or "sk-your" in api_key or "placeholder" in api_key:
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': '请先在设置里配置 DeepSeek API Key'})}\n\n"]),
            media_type="text/event-stream",
        )

    # Load skill
    skill = load_skill(conv.skill_name)
    if not skill:
        skill = load_skill("bestie")  # fallback
    system_prompt = build_system_prompt(skill)

    # Build message context
    all_messages = db.query(Message).filter(
        Message.conversation_id == conv.id
    ).order_by(Message.id).all()
    context = build_context(all_messages)

    def event_stream():
        full_reply = ""
        try:
            for token in chat_stream(context, system_prompt, db_session=db):
                full_reply += token
                yield f"data: {json.dumps({'token': token})}\n\n"
            # Save assistant message
            assistant_msg = Message(
                conversation_id=conv.id,
                role="assistant",
                content=full_reply,
            )
            db.add(assistant_msg)
            db.commit()
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
