"""Skill CRUD + conversation management APIs."""
import json
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db.database import get_db
from db.models import Conversation, Message, Setting
from services.skill import list_skills, load_skill, SKILLS_DIR, AVATARS_DIR, AVATAR_EXTENSIONS

router = APIRouter(tags=["skills"])


# ── Request models ──

class ConversationCreate(BaseModel):
    title: Optional[str] = "新的对话"
    skill_name: str = "bestie"


class ConversationRename(BaseModel):
    title: str


# ── Skills ──

@router.get("/api/skills")
def get_skills():
    """List all available skill presets."""
    return list_skills()


@router.get("/api/skills/{skill_id}")
def get_skill(skill_id: str):
    """Get full skill definition."""
    skill = load_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


# ── Conversations ──

@router.get("/api/conversations")
def get_conversations(db: Session = Depends(get_db)):
    """List all conversations, newest first."""
    return db.query(Conversation).order_by(
        Conversation.updated_at.desc()).all()


@router.post("/api/conversations")
def create_conversation(body: ConversationCreate, db: Session = Depends(get_db)):
    """Create a new conversation with a given skill."""
    conv = Conversation(title=body.title, skill_name=body.skill_name)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/api/conversations/{conv_id}")
def delete_conversation(conv_id: int, db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(conv)
    db.commit()
    return {"ok": True}


@router.put("/api/conversations/{conv_id}/rename")
def rename_conversation(conv_id: int, body: ConversationRename,
                        db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    conv.title = body.title
    db.commit()
    return {"ok": True}


@router.put("/api/conversations/{conv_id}/skill")
def change_skill(conv_id: int, skill_name: str,
                 db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    conv.skill_name = skill_name
    db.commit()
    return {"ok": True}


# ── Messages ──

@router.get("/api/conversations/{conv_id}/messages")
def get_messages(conv_id: int, db: Session = Depends(get_db)):
    """Get all messages for a conversation."""
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    return db.query(Message).filter(
        Message.conversation_id == conv_id).order_by(Message.id).all()


# ── Settings ──

class SettingUpdate(BaseModel):
    value: str


@router.put("/api/settings/{key}")
def update_setting(key: str, body: SettingUpdate,
                   db: Session = Depends(get_db)):
    """Save a setting (e.g. api_key)."""
    row = db.query(Setting).filter(Setting.key == key).first()
    if row:
        row.value = body.value
    else:
        row = Setting(key=key, value=body.value)
        db.add(row)
    db.commit()
    from services.llm import _resolve_api_key
    _resolve_api_key(db)  # bust cache
    return {"ok": True}


@router.get("/api/settings/{key}")
def get_setting(key: str, db: Session = Depends(get_db)):
    """Get a setting value. Returns empty string if not set."""
    row = db.query(Setting).filter(Setting.key == key).first()
    return {"key": key, "value": row.value if row else ""}


# ── Skill file management ──

def _safe_skill_id(name: str) -> str:
    """Convert a name to a safe file-system ID."""
    # Replace problematic characters with underscore
    import re
    safe = re.sub(r'[\\/:*?"<>|]', '_', name)
    return safe.strip() or "untitled"


@router.post("/api/skills/upload")
async def upload_skill(file: UploadFile = File(...)):
    """Upload a custom skill JSON or TXT file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")

    content = await file.read()
    fname = file.filename.lower()

    if fname.endswith(".json"):
        # ── JSON import ──
        try:
            data = json.loads(content)
            assert "name" in data
        except (json.JSONDecodeError, AssertionError):
            raise HTTPException(status_code=400,
                                detail="Invalid skill JSON (needs 'name' field)")
        skill_id = _safe_skill_id(data["name"])
        dest = SKILLS_DIR / f"{skill_id}.json"
        dest.write_bytes(content)
        return {"ok": True, "id": skill_id, "name": data["name"]}

    elif fname.endswith(".txt"):
        # ── Text file import → freeform skill ──
        try:
            text = content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = content.decode("gbk")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400,
                                    detail="Cannot decode text file (try UTF-8 or GBK)")

        if not text.strip():
            raise HTTPException(status_code=400, detail="Text file is empty")

        # Derive skill name from filename (without .txt extension)
        name = Path(file.filename).stem.strip()
        skill_id = _safe_skill_id(name)

        # First line as description (truncated)
        first_line = text.strip().split("\n")[0][:80]

        skill_data = {
            "name": name,
            "description": f"文本导入 · {first_line}",
            "relationship": "朋友",
            "raw_prompt": text.strip(),
        }
        dest = SKILLS_DIR / f"{skill_id}.json"
        dest.write_text(json.dumps(skill_data, ensure_ascii=False, indent=2),
                        encoding="utf-8")
        return {"ok": True, "id": skill_id, "name": name}

    else:
        raise HTTPException(status_code=400,
                            detail="Only .json or .txt files allowed")


@router.delete("/api/skills/{skill_id}")
def delete_skill(skill_id: str):
    """Delete a custom skill. Built-in skills are protected."""
    protected = {"girlfriend", "bestie", "mentor"}
    if skill_id in protected:
        raise HTTPException(status_code=403,
                            detail="Cannot delete built-in skills")
    path = SKILLS_DIR / f"{skill_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")
    path.unlink()
    # Also delete avatar if exists
    _delete_avatar_files(skill_id)
    return {"ok": True}


# ── Skill rename ──

class SkillRename(BaseModel):
    name: str


@router.put("/api/skills/{skill_id}/rename")
def rename_skill(skill_id: str, body: SkillRename, db: Session = Depends(get_db)):
    """Rename a skill: updates JSON file, avatar file, and conversation refs."""
    new_name = body.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    # Check skill exists
    old_path = SKILLS_DIR / f"{skill_id}.json"
    if not old_path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")

    new_id = _safe_skill_id(new_name)

    # If ID changes, check no conflict (unless it's the same file)
    if new_id != skill_id:
        new_path = SKILLS_DIR / f"{new_id}.json"
        if new_path.exists():
            raise HTTPException(status_code=409, detail="A skill with this name already exists")

        # Rename JSON file
        old_path.rename(new_path)

        # Update name field inside JSON
        data = json.loads(new_path.read_text(encoding="utf-8"))
        data["name"] = new_name
        new_path.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                           encoding="utf-8")

        # Rename avatar file if exists
        for ext in AVATAR_EXTENSIONS:
            old_av = AVATARS_DIR / f"{skill_id}{ext}"
            if old_av.exists():
                old_av.rename(AVATARS_DIR / f"{new_id}{ext}")

        # Update conversations that reference old skill_name → new_id
        db.query(Conversation).filter(
            Conversation.skill_name == skill_id
        ).update({Conversation.skill_name: new_id})
        db.commit()

        return {"ok": True, "id": new_id, "name": new_name}
    else:
        # Same ID, just update the name field
        data = json.loads(old_path.read_text(encoding="utf-8"))
        data["name"] = new_name
        old_path.write_text(json.dumps(data, ensure_ascii=False, indent=2),
                           encoding="utf-8")
        return {"ok": True, "id": skill_id, "name": new_name}


# ── Avatar management ──

ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2 MB


def _delete_avatar_files(skill_id: str):
    """Remove any existing avatar files for a skill."""
    for ext in AVATAR_EXTENSIONS:
        avatar_path = AVATARS_DIR / f"{skill_id}{ext}"
        if avatar_path.exists():
            avatar_path.unlink()


@router.post("/api/skills/{skill_id}/avatar")
async def upload_avatar(skill_id: str, file: UploadFile = File(...)):
    """Upload an avatar image for a skill."""
    # Validate skill exists
    skill_path = SKILLS_DIR / f"{skill_id}.json"
    if not skill_path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")

    # Validate file type
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {file.content_type}. "
                   f"Allowed: png, jpeg, gif, webp"
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large ({len(content)} bytes). Max: {MAX_AVATAR_SIZE} bytes"
        )

    # Determine extension
    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }
    ext = ext_map.get(file.content_type, ".png")

    # Remove old avatar files (any extension)
    _delete_avatar_files(skill_id)

    # Save new avatar
    AVATARS_DIR.mkdir(exist_ok=True)
    avatar_path = AVATARS_DIR / f"{skill_id}{ext}"
    avatar_path.write_bytes(content)

    return {"ok": True, "avatar_url": f"/avatars/{skill_id}{ext}"}


@router.delete("/api/skills/{skill_id}/avatar")
def delete_avatar(skill_id: str):
    """Remove the avatar for a skill."""
    skill_path = SKILLS_DIR / f"{skill_id}.json"
    if not skill_path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")

    _delete_avatar_files(skill_id)
    return {"ok": True}


# ── User profile ──

PROFILE_AVATAR_PREFIX = "_profile"


def _get_profile_avatar_url() -> str | None:
    """Return the user profile avatar URL if exists."""
    for ext in AVATAR_EXTENSIONS:
        avatar_path = AVATARS_DIR / f"{PROFILE_AVATAR_PREFIX}{ext}"
        if avatar_path.exists():
            return f"/avatars/{PROFILE_AVATAR_PREFIX}{ext}"
    return None


class ProfileUpdate(BaseModel):
    name: str


@router.get("/api/profile")
def get_profile(db: Session = Depends(get_db)):
    """Get user profile (name + avatar)."""
    name_row = db.query(Setting).filter(Setting.key == "user_name").first()
    return {
        "name": name_row.value if name_row else "我",
        "avatar": _get_profile_avatar_url(),
    }


@router.put("/api/profile")
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db)):
    """Update user profile name."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    row = db.query(Setting).filter(Setting.key == "user_name").first()
    if row:
        row.value = name
    else:
        row = Setting(key="user_name", value=name)
        db.add(row)
    db.commit()
    return {"ok": True, "name": name}


@router.post("/api/profile/avatar")
async def upload_profile_avatar(file: UploadFile = File(...)):
    """Upload user profile avatar."""
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported image type: {file.content_type}"
        )

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Image too large")

    ext_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/gif": ".gif",
        "image/webp": ".webp",
    }
    ext = ext_map.get(file.content_type, ".png")

    # Remove old profile avatar
    _delete_avatar_files(PROFILE_AVATAR_PREFIX)

    AVATARS_DIR.mkdir(exist_ok=True)
    avatar_path = AVATARS_DIR / f"{PROFILE_AVATAR_PREFIX}{ext}"
    avatar_path.write_bytes(content)

    return {"ok": True, "avatar_url": f"/avatars/{PROFILE_AVATAR_PREFIX}{ext}"}


@router.delete("/api/profile/avatar")
def delete_profile_avatar():
    """Remove user profile avatar."""
    _delete_avatar_files(PROFILE_AVATAR_PREFIX)
    return {"ok": True}
