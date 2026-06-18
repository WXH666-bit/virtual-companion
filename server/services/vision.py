"""Vision service — describe images so the AI character can "see" stickers.

When the user sends a sticker GIF, this service calls a vision-capable model
to generate a short Chinese description of the image content.  The description
is then injected into the chat context so the character LLM can respond to
the actual content rather than just knowing "a sticker was sent".

GIF images are auto-converted to PNG (first frame) before sending to the vision
API, since most vision models (Qwen-VL, etc.) don't support GIF natively.
"""
import base64
import io
import traceback
from openai import OpenAI
from db.models import Setting

# ── Which models natively support vision (multimodal) ──

VISION_NATIVE: dict[str, list[str]] = {
    "openai": [
        "gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini",
        "gpt-4-turbo", "gpt-4-vision-preview",
    ],
    "zhipu": [
        "glm-4v", "glm-4v-flash", "glm-4", "glm-4-plus",
        "glm-4v-plus",
    ],
    "qwen": [
        "qwen-vl-plus", "qwen-vl-max", "qwen2.5-vl-72b-instruct",
        "qwen2.5-vl-32b-instruct", "qwen2.5-vl-7b-instruct",
        "qwen-vl-turbo",
    ],
    "siliconflow": [
        "Qwen/Qwen2.5-VL-32B-Instruct",
        "Qwen/Qwen2.5-VL-72B-Instruct",
        "Qwen/Qwen2.5-VL-7B-Instruct",
        "Qwen/QVQ-72B-Preview",
    ],
}

# Vision provider presets (for when chat model doesn't support vision)
VISION_PROVIDER_PRESETS = {
    "siliconflow": {
        "name": "硅基流动",
        "base_url": "https://api.siliconflow.cn/v1",
        "default_model": "Qwen/Qwen2.5-VL-32B-Instruct",
        "models": [
            "Qwen/Qwen2.5-VL-32B-Instruct",
            "Qwen/Qwen2.5-VL-72B-Instruct",
            "Qwen/Qwen2.5-VL-7B-Instruct",
        ],
    },
    "zhipu": {
        "name": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4v-flash",
        "models": ["glm-4v-flash", "glm-4v", "glm-4v-plus"],
    },
    "qwen": {
        "name": "通义千问",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-vl-plus",
        "models": ["qwen-vl-plus", "qwen-vl-max"],
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o-mini",
        "models": ["gpt-4o-mini", "gpt-4o"],
    },
}


def supports_vision(provider_id: str, model_name: str) -> bool:
    """Check whether the given model natively supports vision/image input."""
    if provider_id not in VISION_NATIVE:
        return False
    allowed = VISION_NATIVE[provider_id]
    # Exact match or prefix match (e.g. "gpt-4o" matches "gpt-4o-2024-08-06")
    if model_name in allowed:
        return True
    return any(model_name.startswith(m) for m in allowed)


def is_vision_enabled(db_session, user_id: int | None = None) -> bool:
    """Check whether the user has enabled image recognition."""
    if db_session is None:
        return False
    q = db_session.query(Setting).filter(Setting.key == "vision_enabled")
    if user_id is not None:
        q = q.filter(Setting.user_id == user_id)
    row = q.first()
    return row is not None and row.value.lower() == "true"


def _get_setting(db_session, key: str, user_id: int | None = None, default: str = "") -> str:
    """Read a single setting value for a given user, or return the default."""
    if db_session is None:
        return default
    q = db_session.query(Setting).filter(Setting.key == key)
    if user_id is not None:
        q = q.filter(Setting.user_id == user_id)
    row = q.first()
    return row.value if row and row.value else default


def _prepare_image(image_url: str) -> dict | None:
    """
    Prepare an image for the vision API. GIFs are converted to PNG (first frame)
    and returned as a base64 data URI, since most vision models don't support GIF.
    Non-GIF images are returned as a plain URL reference.

    Returns a dict suitable for OpenAI vision content blocks, or None on failure.
    """
    is_gif = image_url.lower().endswith(".gif") or ".gif?" in image_url.lower()

    if not is_gif:
        # Non-GIF: pass URL directly
        return {"type": "image_url", "image_url": {"url": image_url}}

    # GIF: download, extract first frame, convert to PNG base64
    try:
        import requests
        from PIL import Image, ImageSequence

        print(f"[Vision] 检测到 GIF，下载并提取首帧...")
        resp = requests.get(image_url, timeout=8, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        })
        resp.raise_for_status()

        # Open GIF and seek to first frame
        img = Image.open(io.BytesIO(resp.content))
        # For animated GIFs, get the first frame
        if getattr(img, "is_animated", False):
            # Use ImageSequence to get first frame correctly
            frames = list(ImageSequence.Iterator(img))
            first = frames[0].convert("RGB")
        else:
            first = img.convert("RGB")

        # Encode as PNG base64
        buf = io.BytesIO()
        first.save(buf, format="PNG", optimize=True)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        data_uri = f"data:image/png;base64,{b64}"
        print(f"[Vision] GIF 已转为 PNG base64 ({len(b64)} chars)")
        return {"type": "image_url", "image_url": {"url": data_uri}}

    except Exception as e:
        print(f"[Vision] GIF 帧提取失败: {e}")
        # Fall back: try the original URL anyway
        return {"type": "image_url", "image_url": {"url": image_url}}


def describe_image(image_url: str, db_session, user_id: int | None = None) -> str | None:
    """
    Call a vision model to describe an image in Chinese (≤ 20 chars).

    Strategy:
      1. If vision is disabled in settings → return None
      2. If the current chat model supports vision → use the same provider/key
      3. Otherwise → use the separately configured vision provider/key
      4. On any error → return None (graceful degradation)

    Returns a short Chinese description, or None.
    """
    if not is_vision_enabled(db_session, user_id=user_id):
        return None

    if not image_url or not image_url.startswith("http"):
        return None

    # Determine which provider / key / model to use
    from services.llm import resolve_provider_config

    chat_config = resolve_provider_config(db_session, user_id=user_id)
    chat_provider = chat_config["provider"]
    chat_model = chat_config["model_name"]

    if supports_vision(chat_provider, chat_model):
        # Chat model itself is multimodal — reuse
        api_key = chat_config["api_key"]
        base_url = chat_config["base_url"]
        model = chat_model
        print(f"[Vision] 使用聊天模型识别: {model}")
    else:
        # Need separate vision config
        vision_provider = _get_setting(db_session, "vision_provider", user_id=user_id, default="siliconflow")
        api_key = _get_setting(db_session, "vision_api_key", user_id=user_id, default="")
        base_url = _get_setting(db_session, "vision_base_url", user_id=user_id, default="")
        model = _get_setting(db_session, "vision_model", user_id=user_id, default="")

        # Fall back to preset defaults
        preset = VISION_PROVIDER_PRESETS.get(vision_provider, {})
        if not base_url:
            base_url = preset.get("base_url", "")
        if not model:
            model = preset.get("default_model", "")
        if not api_key:
            # Try to read from env as last resort
            import os
            api_key = os.getenv("VISION_API_KEY", "")

        if not api_key or not base_url:
            print("[Vision] 视觉 API 未配置，跳过识别")
            return None
        print(f"[Vision] 使用独立视觉模型: {model} @ {base_url[:40]}...")

    # Prepare image (convert GIF → PNG base64 if needed)
    image_block = _prepare_image(image_url)

    # Call vision API
    try:
        client = OpenAI(api_key=api_key, base_url=base_url)
        resp = client.chat.completions.create(
            model=model,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "请用一句话简单描述这张动图表情包的内容和氛围，"
                            "注意图中可能有的中文配文。20字以内，直接输出描述不要前缀。"
                        ),
                    },
                    image_block,
                ],
            }],
            max_tokens=80,
            temperature=0.3,
            timeout=8,
        )
        desc = resp.choices[0].message.content
        if desc:
            desc = desc.strip()
            # Truncate to ~30 chars max (Chinese)
            if len(desc) > 30:
                desc = desc[:30]
            print(f"[Vision] 识别结果: {desc}")
            return desc
    except Exception as e:
        print(f"[Vision] 识别失败: {type(e).__name__}: {e}")
        traceback.print_exc()

    return None
