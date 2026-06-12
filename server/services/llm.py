"""DeepSeek API client — OpenAI-compatible interface."""
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-chat"

# Cache for dynamic API key
_cached_key: str | None = None
_cached_client: OpenAI | None = None


def _resolve_api_key(db_session=None) -> str:
    """Get API key: DB setting first, then .env, then dummy."""
    # Try database
    if db_session:
        from db.models import Setting
        row = db_session.query(Setting).filter(Setting.key == "api_key").first()
        if row and row.value and "sk-" in row.value:
            return row.value

    # Fallback to .env
    env_key = os.getenv("DEEPSEEK_API_KEY", "")
    if env_key and "sk-your" not in env_key:
        return env_key

    return "sk-placeholder"


def get_client(db_session=None) -> OpenAI:
    """Get or create an OpenAI client with the current API key."""
    global _cached_key, _cached_client

    key = _resolve_api_key(db_session)
    if key != _cached_key:
        _cached_client = OpenAI(api_key=key, base_url=DEEPSEEK_BASE_URL)
        _cached_key = key
    return _cached_client


def chat_stream(messages: list[dict], system_prompt: str, db_session=None):
    """
    Stream a chat completion from DeepSeek.
    Yields content deltas as strings.
    """
    client = get_client(db_session)
    full_messages = [
        {"role": "system", "content": system_prompt},
        *messages,
    ]

    stream = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        messages=full_messages,
        stream=True,
        temperature=0.85,
        max_tokens=1024,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta
        if delta.content:
            yield delta.content
