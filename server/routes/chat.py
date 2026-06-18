"""Chat API — send message + SSE streaming response."""
import json
import re
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import Conversation, Message, User
from services.auth import get_current_user
from services.llm import chat_stream, resolve_provider_config
from services.skill import load_skill, build_system_prompt
from services.memory import build_context
from services.sticker import pick_sticker

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Regex: matches [STICKER:keyword] or [STICKER：keyword]
# (case-insensitive, English or Chinese colon, flexible spacing)
STICKER_RE = re.compile(r'\[STICKER[：:]\s*([^\]]+?)\s*\]', re.IGNORECASE)

# Regex: matches bracket text that narrates sending a sticker/emoji/GIF
# (AI sometimes mimics the old context annotation format from memory.py)
NARRATION_BRACKET_RE = re.compile(
    r'\s*[\[（][^\]）]*?(?:发送了|发了|发送一张|发一张|发送了个|发了个|'
    r'备注：|上条消息|附带动图|附带表情)'
    r'[^\]）]*?[\]）]\s*',
    re.IGNORECASE
)


class SendRequest(BaseModel):
    conversation_id: int
    content: str
    sticker_url: Optional[str] = None
    sticker_emoji: Optional[str] = None


def parse_stickers(text: str) -> tuple[str, list[str]]:
    """
    Extract [STICKER:keyword] markers from text.
    Returns (cleaned_text, list_of_keywords).
    """
    keywords = []
    for m in STICKER_RE.finditer(text):
        kw = m.group(1).strip()
        if kw:
            keywords.append(kw)
    clean = STICKER_RE.sub("", text).strip()
    # Clean up double newlines from removed markers
    clean = re.sub(r'\n{3,}', '\n\n', clean)
    return clean, keywords


def strip_narration_brackets(text: str) -> tuple[str, list[str]]:
    """
    Strip bracket patterns that narrate sticker sending actions.
    These are NOT valid [STICKER:xxx] commands — they are AI mimicry of
    old context annotation format. Returns (cleaned_text, stripped_items).
    """
    stripped = []
    for m in NARRATION_BRACKET_RE.finditer(text):
        stripped.append(m.group().strip())
    clean = NARRATION_BRACKET_RE.sub("", text).strip()
    # Clean up double newlines from removed markers
    clean = re.sub(r'\n{3,}', '\n\n', clean)
    return clean, stripped


@router.post("/send")
def send_message(body: SendRequest, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Send a user message. Returns streaming assistant reply via SSE."""
    conversation_id = body.conversation_id
    content = body.content
    sticker_url = body.sticker_url
    sticker_emoji = body.sticker_emoji

    conv = db.query(Conversation).filter(
        Conversation.id == conversation_id,
        Conversation.user_id == user.id,
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Save user message with optional sticker
    user_msg = Message(
        conversation_id=conv.id,
        role="user",
        content=content,
        sticker_url=sticker_url,
        sticker_emoji=sticker_emoji,
    )
    db.add(user_msg)
    db.commit()

    # If user sent a sticker GIF, run vision in background daemon thread.
    # Vision result is stored on the Message row and picked up on the NEXT turn,
    # so the SSE stream starts immediately with zero delay.
    if sticker_url:
        import threading
        from services.vision import describe_image
        from db.database import SessionLocal
        msg_id = user_msg.id  # capture id, NOT the db session

        def _run_vision_bg():
            vision_db = SessionLocal()
            try:
                desc = describe_image(sticker_url, vision_db, user_id=user.id)
                if desc:
                    msg = vision_db.query(Message).filter(Message.id == msg_id).first()
                    if msg:
                        msg.img_desc = desc
                        vision_db.commit()
                        print(f"[Vision] 后台识别完成: {desc}")
            except Exception as e:
                print(f"[Vision] 后台识别异常: {e}")
            finally:
                vision_db.close()

        threading.Thread(target=_run_vision_bg, daemon=True).start()
        print("[Vision] 已启动后台识别线程，不阻塞聊天")

    # Check API key
    config = resolve_provider_config(db, user_id=user.id)
    api_key = config["api_key"]
    if not api_key or "placeholder" in api_key or "sk-your" in api_key:
        return StreamingResponse(
            iter([f"data: {json.dumps({'error': '请先在设置里配置 API Key'})}\n\n"]),
            media_type="text/event-stream",
        )

    # Load skill
    skill = load_skill(conv.skill_name)
    if not skill:
        skill = load_skill("bestie")  # fallback
    system_prompt = build_system_prompt(skill)

    # Build message context (img_desc from DB column is read by memory.py)
    all_messages = db.query(Message).filter(
        Message.conversation_id == conv.id
    ).order_by(Message.id).all()

    context = build_context(all_messages)

    def event_stream():
        full_reply = ""
        try:
            for token in chat_stream(context, system_prompt, db_session=db,
                                     user_id=user.id):
                full_reply += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            # Parse sticker markers from full response
            clean_text, sticker_keywords = parse_stickers(full_reply)

            # Defensive: strip narration-like bracket patterns
            # (AI sometimes mimics old context annotation format)
            clean_text, stripped_narrations = strip_narration_brackets(clean_text)
            if stripped_narrations:
                print(f"[Chat] 已过滤无效表情包叙述: {stripped_narrations}")

            # If markers were found, send cleaned text (unconditionally)
            if sticker_keywords:
                yield f"data: {json.dumps({'clean_text': clean_text})}\n\n"

            # Search for stickers; collect first result for persistence
            sticker_url = None
            sticker_emoji = None
            for keyword in sticker_keywords:
                if sticker_url or sticker_emoji:
                    break  # only first sticker
                result = pick_sticker(keyword, db_session=db)
                if result:
                    if result.startswith("http"):
                        sticker_url = result
                        yield f"data: {json.dumps({'sticker': result, 'sticker_type': 'image', 'keyword': keyword})}\n\n"
                    else:
                        sticker_emoji = result
                        yield f"data: {json.dumps({'sticker': result, 'sticker_type': 'emoji', 'keyword': keyword})}\n\n"

            # Save assistant message with sticker data
            assistant_msg = Message(
                conversation_id=conv.id,
                role="assistant",
                content=clean_text,
                sticker_url=sticker_url,
                sticker_emoji=sticker_emoji,
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
