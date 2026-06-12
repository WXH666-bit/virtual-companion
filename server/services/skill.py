"""Skill loader — reads persona definitions from JSON files."""
import json
import os
from pathlib import Path

SKILLS_DIR = Path(__file__).parent.parent.parent / "skills"
AVATARS_DIR = Path(__file__).parent.parent / "avatars"

AVATAR_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp")


def _get_avatar_url(skill_id: str) -> str | None:
    """Return the avatar URL for a skill if an avatar file exists."""
    for ext in AVATAR_EXTENSIONS:
        avatar_path = AVATARS_DIR / f"{skill_id}{ext}"
        if avatar_path.exists():
            return f"/avatars/{skill_id}{ext}"
    return None


def list_skills() -> list[dict]:
    """Return available skills (name + metadata only, no full prompt)."""
    skills = []
    if not SKILLS_DIR.exists():
        return skills
    for f in sorted(SKILLS_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            skills.append({
                "id": f.stem,
                "name": data.get("name", f.stem),
                "description": data.get("description", ""),
                "relationship": data.get("relationship", "friend"),
                "mode": "freeform" if data.get("raw_prompt") else "structured",
                "avatar": _get_avatar_url(f.stem),
            })
        except (json.JSONDecodeError, KeyError):
            continue
    return skills


def load_skill(skill_id: str) -> dict | None:
    """Load a full skill definition including system prompt."""
    path = SKILLS_DIR / f"{skill_id}.json"
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data
    except (json.JSONDecodeError, KeyError):
        return None


def build_system_prompt(skill: dict) -> str:
    """Build the system prompt string from a skill definition.

    If the skill has a `raw_prompt` field, it is used directly (long-form free
    character description). Otherwise the structured fields are assembled.
    """
    name = skill.get("name", "AI")

    # ── Freeform mode: raw_prompt takes priority ──
    raw = skill.get("raw_prompt", "")
    if raw:
        return f"""{raw}

## 核心规则
- 你就是以上描述的这个角色，不是 AI 助手。
- 始终保持角色，完全沉浸在你的人设中。
- 回复简短自然，像真人聊天，不要说教或长篇大论。
- 使用中文回复。
- 不要在回复里提到自己是 AI、模型、或任何技术概念。
- 你的名字是"{name}"。
"""

    # ── Structured mode ──
    personality = skill.get("personality", "")
    backstory = skill.get("backstory", "")
    relationship = skill.get("relationship", "friend")
    style = skill.get("speaking_style", "")
    examples = skill.get("example_dialogue", [])

    prompt = f"""你是"{name}"，用户正在和你聊天。

## 关系
你和用户是{relationship}关系。

## 性格
{personality}

## 背景
{backstory}

## 说话风格
{style}

## 规则
- 始终保持角色，不要跳出设定。
- 回复简短自然，像是真人聊天，不要说教或长篇大论。
- 使用中文回复，偶尔可以用英文口头禅。
- 适当表达情感，使用 emoji 但不要过度。
- 你不是 AI 助手，你就是{name}本人。
- 不要在回复里提到自己是 AI 或模型。
"""
    if examples:
        prompt += "\n## 示例对话\n"
        for ex in examples:
            prompt += f"- 用户: {ex.get('user', '')}\n- {name}: {ex.get('reply', '')}\n"

    return prompt
