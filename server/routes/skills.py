"""Skill CRUD + conversation management APIs."""
import json
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from db.database import get_db
from db.models import Conversation, Message, Setting, User
from services.auth import get_current_user
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
def get_conversations(db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """List all conversations for the current user, newest first."""
    return db.query(Conversation).filter(
        Conversation.user_id == user.id
    ).order_by(Conversation.updated_at.desc()).all()


@router.post("/api/conversations")
def create_conversation(body: ConversationCreate, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """Create a new conversation with a given skill."""
    title = body.title
    if not title or title == "新的对话":
        skill = load_skill(body.skill_name)
        title = skill.get("name", body.skill_name) if skill else body.skill_name
    conv = Conversation(title=title, skill_name=body.skill_name, user_id=user.id)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv


@router.delete("/api/conversations/{conv_id}")
def delete_conversation(conv_id: int, db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(conv)
    db.commit()
    return {"ok": True}


@router.put("/api/conversations/{conv_id}/rename")
def rename_conversation(conv_id: int, body: ConversationRename,
                        db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    conv.title = body.title
    db.commit()
    return {"ok": True}


@router.put("/api/conversations/{conv_id}/skill")
def change_skill(conv_id: int, skill_name: str,
                 db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    conv = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    conv.skill_name = skill_name
    db.commit()
    return {"ok": True}


@router.delete("/api/skills/{skill_id}/clear-context")
def clear_skill_context(skill_id: str,
                        db: Session = Depends(get_db),
                        user: User = Depends(get_current_user)):
    """Clear all messages in all conversations for a given skill."""
    skill = load_skill(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    skill_name = skill.get("name", skill_id)
    convs = db.query(Conversation).filter(
        Conversation.user_id == user.id,
        Conversation.skill_name == skill_name,
    ).all()
    cleared = 0
    for conv in convs:
        db.query(Message).filter(
            Message.conversation_id == conv.id
        ).delete()
        cleared += 1
    db.commit()
    return {"ok": True, "cleared": cleared}


# ── Messages ──

@router.get("/api/conversations/{conv_id}/messages")
def get_messages(conv_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Get all messages for a conversation."""
    conv = db.query(Conversation).filter(
        Conversation.id == conv_id, Conversation.user_id == user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    return db.query(Message).filter(
        Message.conversation_id == conv_id).order_by(Message.id).all()


# ── Settings ──

class SettingUpdate(BaseModel):
    value: str


@router.put("/api/settings/{key}")
def update_setting(key: str, body: SettingUpdate,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Save a setting for the current user (e.g. api_key)."""
    row = db.query(Setting).filter(
        Setting.key == key, Setting.user_id == user.id).first()
    if row:
        row.value = body.value
    else:
        row = Setting(key=key, value=body.value, user_id=user.id)
        db.add(row)
    db.commit()
    from services.llm import bust_cache
    bust_cache()  # force new client on next request
    return {"ok": True}


@router.get("/api/settings/{key}")
def get_setting(key: str, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    """Get a setting value for the current user. Returns empty string if not set."""
    row = db.query(Setting).filter(
        Setting.key == key, Setting.user_id == user.id).first()
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


# ── Skill update ──

class SkillUpdate(BaseModel):
    raw_prompt: Optional[str] = None
    name: Optional[str] = None
    relationship: Optional[str] = None


@router.put("/api/skills/{skill_id}")
def update_skill(skill_id: str, body: SkillUpdate, db: Session = Depends(get_db)):
    """Update a skill's prompt content and/or metadata."""
    path = SKILLS_DIR / f"{skill_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Skill not found")

    data = json.loads(path.read_text(encoding="utf-8"))

    if body.raw_prompt is not None:
        data["raw_prompt"] = body.raw_prompt.strip()
        # Clear structured fields if switching to freeform
        for k in ("personality", "backstory", "speaking_style", "example_dialogue"):
            data.pop(k, None)
    if body.name is not None and body.name.strip():
        data["name"] = body.name.strip()
        data["description"] = f"{data.get('relationship', '朋友')} · 自定义"
    if body.relationship is not None and body.relationship.strip():
        data["relationship"] = body.relationship.strip()

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
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


# ── Prompt optimization ──

OPTIMIZE_SYSTEM_PROMPT = """你是一个角色描述优化器。你的任务是把用户提供的长段角色描述压缩精简，同时保留所有关键信息。

## 必须保留
- 角色名字
- 性格核心特征（傲娇、温柔、毒舌等）
- 说话风格和语气词习惯
- 与用户的关系及关键背景事件（2-3句概括即可）
- 标志性的小动作或口头禅

## 必须去除
- 重复描述的同类事件（挑选最具代表性的保留）
- 过度修饰的文学性描写
- 冗余的情节细节

## 输出要求
- 保持原文的第一人称或第三人称视角
- 不要改变角色的人设和性格
- 使用要点式分段，每段1-3句话
- 压缩到原文 30-50% 长度
- 直接输出压缩后的描述，不要加任何解释或前缀"""


class OptimizePromptRequest(BaseModel):
    prompt: str


@router.post("/api/skills/optimize-prompt")
def optimize_prompt(body: OptimizePromptRequest, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Use the configured LLM to compress & optimize a character description."""
    from services.llm import get_client, resolve_provider_config

    config = resolve_provider_config(db, user_id=user.id)
    api_key = config["api_key"]
    if not api_key or "placeholder" in api_key or "sk-your" in api_key:
        raise HTTPException(status_code=400, detail="请先在设置里配置 API Key")

    client = get_client(db, user_id=user.id)

    try:
        resp = client.chat.completions.create(
            model=config["model_name"],
            messages=[
                {"role": "system", "content": OPTIMIZE_SYSTEM_PROMPT},
                {"role": "user", "content": body.prompt},
            ],
            temperature=0.3,
            max_tokens=2048,
        )
        optimized = resp.choices[0].message.content or ""
        return {"optimized": optimized.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"优化失败: {str(e)}")


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
def get_profile(db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    """Get user profile (name + avatar) for the current user."""
    name_row = db.query(Setting).filter(
        Setting.key == "user_name", Setting.user_id == user.id).first()
    return {
        "name": name_row.value if name_row else "我",
        "avatar": _get_profile_avatar_url(),
    }


@router.put("/api/profile")
def update_profile(body: ProfileUpdate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    """Update user profile name for the current user."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    row = db.query(Setting).filter(
        Setting.key == "user_name", Setting.user_id == user.id).first()
    if row:
        row.value = name
    else:
        row = Setting(key="user_name", value=name, user_id=user.id)
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


# ── Provider config ──

class ProviderConfig(BaseModel):
    provider: str = "deepseek"
    api_key: str = ""
    base_url: str = ""
    model_name: str = ""


@router.get("/api/providers/presets")
def get_provider_presets():
    """Return available provider presets."""
    from services.llm import PROVIDER_PRESETS
    return PROVIDER_PRESETS


@router.get("/api/provider")
def get_provider(db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """Get the current LLM provider configuration for the current user."""
    from services.llm import resolve_provider_config
    config = resolve_provider_config(db, user_id=user.id)
    return {
        "provider": config["provider"],
        "api_key": config["api_key"],
        "base_url": config["base_url"],
        "model_name": config["model_name"],
    }


@router.get("/api/vision/config")
def get_vision_config(db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    """Get all vision settings in one call."""
    def _get(key: str) -> str:
        row = db.query(Setting).filter(
            Setting.key == key, Setting.user_id == user.id
        ).first()
        return row.value if row and row.value else ""
    return {
        "vision_provider": _get("vision_provider"),
        "vision_model": _get("vision_model"),
        "vision_api_key": _get("vision_api_key"),
        "vision_base_url": _get("vision_base_url"),
    }


@router.put("/api/provider")
def update_provider(body: ProviderConfig, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """Save LLM provider configuration for the current user."""
    from services.llm import PROVIDER_PRESETS, bust_cache

    provider = body.provider.strip()
    if provider not in PROVIDER_PRESETS:
        raise HTTPException(status_code=400,
                            detail=f"Unknown provider: {provider}")

    # Save each setting
    settings_to_save = {}

    # Provider ID
    settings_to_save["provider"] = provider

    # Base URL (only save if custom override, otherwise clear)
    if body.base_url.strip():
        preset = PROVIDER_PRESETS.get(provider, {})
        if body.base_url.strip() != preset.get("base_url", ""):
            settings_to_save["base_url"] = body.base_url.strip()
        else:
            settings_to_save["base_url"] = ""  # clear any previous override
    else:
        # If switching to a preset, clear custom URL
        preset = PROVIDER_PRESETS.get(provider, {})
        if preset.get("base_url", ""):
            settings_to_save["base_url"] = ""

    # Model name
    if body.model_name.strip():
        preset = PROVIDER_PRESETS.get(provider, {})
        if body.model_name.strip() != preset.get("default_model", ""):
            settings_to_save["model_name"] = body.model_name.strip()
        else:
            settings_to_save["model_name"] = ""
    else:
        settings_to_save["model_name"] = ""

    # API Key (only if provided, i.e. actual key NOT masked)
    if body.api_key.strip() and "*" not in body.api_key:
        settings_to_save["api_key"] = body.api_key.strip()

    # Write to DB — each setting is keyed by (key, user_id)
    for key, val in settings_to_save.items():
        row = db.query(Setting).filter(
            Setting.key == key, Setting.user_id == user.id).first()
        if val:
            if row:
                row.value = val
            else:
                row = Setting(key=key, value=val, user_id=user.id)
                db.add(row)
        else:
            # Remove empty values to let fallback work
            if row:
                row.value = ""
                # Don't delete — keep the row so we know it was explicitly cleared

    db.commit()
    bust_cache()
    return {"ok": True}


# ── Sticker API ──


@router.get("/api/stickers/emoji")
def get_emoji_map():
    """Return the emoji category map for the frontend sticker picker."""
    from services.sticker import list_emoji_map
    return {"categories": list_emoji_map()}


# ── Vision config ──


@router.get("/api/vision/providers")
def get_vision_providers():
    """Return available vision model providers and their presets."""
    from services.vision import VISION_PROVIDER_PRESETS
    return VISION_PROVIDER_PRESETS


@router.get("/api/vision/check")
def check_vision_support(db: Session = Depends(get_db),
                          user: User = Depends(get_current_user)):
    """Check if current chat model supports vision natively."""
    from services.vision import supports_vision, is_vision_enabled
    from services.llm import resolve_provider_config

    config = resolve_provider_config(db, user_id=user.id)
    native = supports_vision(config["provider"], config["model_name"])
    enabled = is_vision_enabled(db, user_id=user.id)

    return {
        "native": native,
        "enabled": enabled,
        "provider": config["provider"],
        "model": config["model_name"],
    }


@router.get("/api/stickers/popular")
def get_popular_stickers():
    """Return a curated set of popular GIF stickers across categories."""
    from services.sticker import search_sticker_gif
    seen = set()
    results = []
    for kw in ["开心", "撒娇", "笑哭", "猫", "狗", "比心", "加油", "晚安"]:
        for url in search_sticker_gif(kw, max_results=3):
            if url not in seen:
                seen.add(url)
                results.append(url)
                if len(results) >= 20:
                    break
        if len(results) >= 20:
            break
    return {"results": results}


@router.get("/api/stickers/search")
def search_stickers(q: str = ""):
    """Search ChineseBQB GIF stickers by keyword."""
    if not q.strip():
        return {"keyword": q, "results": []}
    from services.sticker import search_sticker_gif
    urls = search_sticker_gif(q.strip(), max_results=20)
    return {"keyword": q.strip(), "results": urls}
