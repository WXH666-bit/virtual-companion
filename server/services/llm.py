"""Multi-provider LLM client — OpenAI-compatible interface."""
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# ── Provider presets ──

PROVIDER_PRESETS = {
    "deepseek": {
        "name": "DeepSeek",
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "openai": {
        "name": "OpenAI",
        "base_url": "https://api.openai.com/v1",
        "default_model": "gpt-4o",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "o4-mini"],
    },
    "zhipu": {
        "name": "智谱 GLM",
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "models": ["glm-4-flash", "glm-4-plus", "glm-4", "glm-4-air"],
    },
    "moonshot": {
        "name": "月之暗面 Kimi",
        "base_url": "https://api.moonshot.cn/v1",
        "default_model": "moonshot-v1-8k",
        "models": ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
    },
    "qwen": {
        "name": "通义千问",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-turbo",
        "models": ["qwen-turbo", "qwen-plus", "qwen-max", "qwen-long"],
    },
    "siliconflow": {
        "name": "硅基流动",
        "base_url": "https://api.siliconflow.cn/v1",
        "default_model": "deepseek-ai/DeepSeek-V3",
        "models": [
            "deepseek-ai/DeepSeek-V3",
            "deepseek-ai/DeepSeek-R1",
            "Qwen/Qwen3-235B-A22B",
            "Pro/Llama-4-Maverick",
        ],
    },
    "deepseek_direct": {
        "name": "DeepSeek 官方（最新模型）",
        "base_url": "https://api.deepseek.com",
        "default_model": "deepseek-chat",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "custom": {
        "name": "自定义",
        "base_url": "",
        "default_model": "",
        "models": [],
    },
}

# Cache
_cached_key: str | None = None
_cached_base_url: str | None = None
_cached_client: OpenAI | None = None


def resolve_provider_config(db_session=None, user_id: int | None = None) -> dict:
    """
    Read provider config from DB settings, filtered by user_id.
    Falls back to defaults (DeepSeek + env or placeholder).
    Returns dict with keys: provider, api_key, base_url, model_name
    """
    provider = "deepseek"
    api_key = "sk-placeholder"
    base_url = PROVIDER_PRESETS["deepseek"]["base_url"]
    model_name = PROVIDER_PRESETS["deepseek"]["default_model"]

    if db_session:
        from db.models import Setting

        def _get(key: str) -> str | None:
            q = db_session.query(Setting).filter(Setting.key == key)
            if user_id is not None:
                q = q.filter(Setting.user_id == user_id)
            row = q.first()
            return row.value if row and row.value else None

        # Read provider
        val = _get("provider")
        if val:
            provider = val

        # Read custom base_url (overrides preset)
        val = _get("base_url")
        if val:
            base_url = val
        elif provider in PROVIDER_PRESETS and PROVIDER_PRESETS[provider]["base_url"]:
            base_url = PROVIDER_PRESETS[provider]["base_url"]

        # Read model_name
        val = _get("model_name")
        if val:
            model_name = val
        elif provider in PROVIDER_PRESETS:
            model_name = PROVIDER_PRESETS[provider]["default_model"]

        # Read api_key
        val = _get("api_key")
        if val and "sk-" in val:
            api_key = val

    # Fallback: .env (legacy)
    if "sk-" not in api_key or "placeholder" in api_key:
        env_key = os.getenv("DEEPSEEK_API_KEY", "")
        if env_key and "sk-your" not in env_key:
            api_key = env_key

    return {
        "provider": provider,
        "api_key": api_key,
        "base_url": base_url,
        "model_name": model_name,
    }


def bust_cache():
    """Clear the cached client so next request picks up new config."""
    global _cached_key, _cached_base_url, _cached_client
    _cached_key = None
    _cached_base_url = None
    _cached_client = None


def get_client(db_session=None, user_id: int | None = None) -> OpenAI:
    """Get or create an OpenAI client with the current config."""
    global _cached_key, _cached_base_url, _cached_client

    config = resolve_provider_config(db_session, user_id=user_id)
    key = config["api_key"]
    base_url = config["base_url"]

    if key != _cached_key or base_url != _cached_base_url:
        _cached_client = OpenAI(api_key=key, base_url=base_url)
        _cached_key = key
        _cached_base_url = base_url
    return _cached_client


def chat_stream(messages: list[dict], system_prompt: str, db_session=None,
                user_id: int | None = None):
    """
    Stream a chat completion from the configured provider.
    Yields content deltas as strings.
    """
    config = resolve_provider_config(db_session, user_id=user_id)
    client = get_client(db_session, user_id=user_id)

    full_messages = [
        {"role": "system", "content": system_prompt},
        *messages,
    ]

    stream = client.chat.completions.create(
        model=config["model_name"],
        messages=full_messages,
        stream=True,
        temperature=0.85,
        max_tokens=1024,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
