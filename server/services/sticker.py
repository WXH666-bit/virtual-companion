"""Sticker search — searches ChineseBQB (5800+ stickers) and falls back to emoji.

Data source: https://github.com/zhaoolee/ChineseBQB (CC0 / public domain)
Mirrors are tried in order; a built-in snapshot is bundled as the last resort.
"""
import urllib.request
import urllib.parse
import json
import ssl
import random
import re
import time
from pathlib import Path

# ── Cache ──

# Mirror URLs — tried in order until one succeeds
BQB_MIRRORS = [
    "https://cdn.jsdelivr.net/gh/zhaoolee/ChineseBQB@master/chinesebqb_github.json",
    "https://raw.githubusercontent.com/zhaoolee/ChineseBQB/master/chinesebqb_github.json",
]

# Local cache file (downloaded copy, 24h TTL)
CACHE_DIR = Path(__file__).parent.parent / ".cache"
CACHE_FILE = CACHE_DIR / "chinesebqb.json"
CACHE_TTL = 86400  # 24 hours

# Built-in snapshot — always available as ultimate fallback
BUILTIN_FILE = Path(__file__).parent.parent / "data" / "chinesebqb.json"

_sticker_index: list[dict] | None = None
_index_loaded_at: float = 0


def _load_index() -> list[dict]:
    """Load the ChineseBQB sticker index.

    Priority:
      1. In-memory cache (fastest)
      2. Local disk cache (if fresh, < 24h)
      3. Download from CDN mirrors → save to cache
      4. Built-in snapshot (bundled with project)
    """
    global _sticker_index, _index_loaded_at

    # Return cached in-memory
    if _sticker_index is not None:
        return _sticker_index

    CACHE_DIR.mkdir(exist_ok=True)

    # ── Try local disk cache ──
    if CACHE_FILE.exists():
        mtime = CACHE_FILE.stat().st_mtime
        if time.time() - mtime < CACHE_TTL:
            try:
                data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
                _sticker_index = data.get("data", [])
                _index_loaded_at = time.time()
                print(f"[Sticker] 从本地缓存加载索引: {len(_sticker_index)} 条 (缓存于 {time.strftime('%H:%M:%S', time.localtime(mtime))})")
                return _sticker_index
            except Exception:
                pass  # Corrupt cache → try next source

    # ── Try downloading from mirrors ──
    for url in BQB_MIRRORS:
        try:
            print(f"[Sticker] 尝试下载索引: {url[:50]}...")
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                raw = json.loads(resp.read().decode("utf-8"))
            _sticker_index = raw.get("data", [])
            _index_loaded_at = time.time()
            # Save to local cache
            CACHE_FILE.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
            print(f"[Sticker] 下载成功，索引 {len(_sticker_index)} 条")
            return _sticker_index
        except Exception as e:
            print(f"[Sticker] 下载失败: {e}")
            continue

    # ── Try stale local cache (even if expired) ──
    if CACHE_FILE.exists():
        try:
            data = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
            _sticker_index = data.get("data", [])
            print(f"[Sticker] 使用过期缓存: {len(_sticker_index)} 条")
            return _sticker_index
        except Exception:
            pass

    # ── Ultimate fallback: built-in snapshot ──
    if BUILTIN_FILE.exists():
        try:
            data = json.loads(BUILTIN_FILE.read_text(encoding="utf-8"))
            _sticker_index = data.get("data", [])
            print(f"[Sticker] 使用内置索引: {len(_sticker_index)} 条")
            return _sticker_index
        except Exception:
            pass

    # Nothing worked
    _sticker_index = []
    print("[Sticker] 警告: 所有索引源均不可用，图片表情包将不可用")
    return _sticker_index


# URL pattern to detect and rewrite ChineseBQB GitHub raw URLs
_BQB_GITHUB_RE = re.compile(
    r'https?://raw\.githubusercontent\.com/zhaoolee/ChineseBQB/master/'
)
_BQB_CDN_PREFIX = "https://cdn.jsdelivr.net/gh/zhaoolee/ChineseBQB@master/"


def _rewrite_url(url: str) -> str:
    """Rewrite GitHub raw URLs to jsDelivr CDN (accessible in China)."""
    return _BQB_GITHUB_RE.sub(_BQB_CDN_PREFIX, url)


def _tokenize(s: str) -> set[str]:
    """Split a string into searchable tokens."""
    tokens = set()
    # Split by common delimiters
    parts = re.split(r'[_\-\s/\\：:，,。.！!？?]+', s.lower())
    for p in parts:
        p = p.strip()
        if len(p) >= 1:
            tokens.add(p)
    # Also add bigrams for Chinese text
    chinese = re.findall(r'[一-鿿]+', s)
    for chunk in chinese:
        for i in range(len(chunk) - 1):
            tokens.add(chunk[i:i+2])
    return tokens


def search_sticker_gif(keyword: str, max_results: int = 10) -> list[str]:
    """
    Search ChineseBQB stickers by keyword.
    Returns list of GIF image URLs (CDN URLs accessible from China).
    """
    if not keyword.strip():
        return []

    index = _load_index()
    if not index:
        print(f"[Sticker] GIF 搜索跳过（索引为空），关键词: {keyword}")
        return []

    kw = keyword.strip().lower()
    kw_tokens = _tokenize(kw)

    scored: list[tuple[int, str]] = []

    for item in index:
        category = item.get("category", "")
        name = item.get("name", "")
        url = item.get("url", "")
        if not url:
            continue

        search_text = f"{category} {name}".lower()
        search_tokens = _tokenize(search_text)

        score = 0
        if kw in name.lower():
            score += 10
        if kw in category.lower():
            score += 8
        overlap = len(kw_tokens & search_tokens)
        score += overlap * 3
        for ct in kw_tokens:
            for st in search_tokens:
                if ct in st or st in ct:
                    score += 1

        if score > 0:
            scored.append((score, url))

    scored.sort(key=lambda x: x[0], reverse=True)

    seen = set()
    urls = []
    for _, url in scored:
        if url not in seen:
            seen.add(url)
            urls.append(url)
        if len(urls) >= max_results:
            break

    # If no results, try random GIFs as fallback
    if not urls:
        gif_items = [it for it in index if it.get("name", "").endswith(".gif")]
        if gif_items:
            sample = random.sample(gif_items, min(max_results, len(gif_items)))
            urls = [it["url"] for it in sample]

    print(f"[Sticker] GIF 搜索: '{keyword}' → {len(urls)} 结果 (评分匹配: {len(scored)})")
    return [_rewrite_url(u) for u in urls]


# ── Emoji fallback ──

EMOJI_MAP: dict[str, list[str]] = {
    "开心": ["😄", "😆", "😊", "🥳"],
    "大笑": ["😂", "🤣", "😆"],
    "害羞": ["😳", "😊", "☺️", "🙈"],
    "难过": ["😢", "😭", "🥺", "💔"],
    "生气": ["😠", "😡", "🤬"],
    "委屈": ["🥺", "😣", "😩"],
    "哭": ["😭", "😢", "🥺"],
    "惊讶": ["😲", "😱", "🤯", "😮"],
    "害怕": ["😨", "😰", "😱"],
    "调皮": ["😜", "😝", "😋", "🤪"],
    "得意": ["😏", "😎", "🤓"],
    "无语": ["😅", "😐", "🙄", "🤦"],
    "无奈": ["😮‍💨", "🙄", "😅"],
    "安慰": ["🤗", "🫂", "💕"],
    "鼓励": ["💪", "👏", "🔥"],
    "喜欢": ["😍", "🥰", "❤️", "💕"],
    "爱": ["❤️", "😍", "💕", "💗"],
    "赞": ["👍", "👏", "💯", "🔥"],
    "厉害": ["👏", "💪", "🔥", "🤩"],
    "可爱": ["🥰", "😊", "🐱", "💝"],
    "撒娇": ["🥺", "😚", "💋", "🤗"],
    "亲亲": ["😚", "😘", "💋"],
    "再见": ["👋", "😴", "💤"],
    "晚安": ["😴", "🌙", "💤", "⭐"],
    "早安": ["☀️", "🌞", "💪"],
    "谢谢": ["🙏", "💕", "🤗"],
    "对不起": ["😣", "🙏", "🥺"],
    "疑惑": ["🤔", "🤨", "❓"],
    "鄙视": ["🙄", "😒"],
    "期待": ["🤩", "😆", "✨"],
    "庆祝": ["🎉", "🥳", "🎊"],
    "吃": ["🍜", "🍕", "😋"],
    "饿": ["🍚", "🍜", "😩"],
    "累": ["😩", "😴", "🥱"],
    "加油": ["💪", "🔥", "⛽", "👊"],
    "OK": ["👌", "👍", "✅"],
    "No": ["🙅", "❌", "👎"],
    "热": ["🥵", "☀️", "🔥"],
    "冷": ["🥶", "❄️", "☃️"],
    "猫": ["🐱", "😺", "😸"],
    "狗": ["🐶", "🐕"],
    "抱抱": ["🤗", "🫂", "💕"],
    "比心": ["🫶", "❤️", "💕"],
    "笑哭": ["😂", "🤣"],
    "翻白眼": ["🙄", "😒"],
    "叹气": ["😮‍💨", "😔"],
    "发呆": ["😶", "🫥", "😐"],
    "哼": ["😤", "😾", "💢"],
    "哇": ["😲", "🤩", "✨"],
    "哈哈": ["😂", "😆", "🤣"],
    "嘿嘿": ["😏", "😁", "😈"],
    "嘻嘻": ["😁", "😋", "😜"],
}


def _emoji_sticker(keyword: str) -> str | None:
    """Find emoji matching a keyword. Always returns something."""
    kw = keyword.strip()
    if kw in EMOJI_MAP:
        return random.choice(EMOJI_MAP[kw])
    for known, emojis in EMOJI_MAP.items():
        if known in kw or kw in known:
            return random.choice(emojis)
    chars = []
    for ch in kw:
        for known, emojis in EMOJI_MAP.items():
            if ch in known:
                chars.append(random.choice(emojis))
                break
    if chars:
        return " ".join(chars[:3])
    # Ultimate fallback: random expressive emoji
    return random.choice(["😄", "😊", "😆", "🥰", "🤗", "✨", "💕", "🎉", "😋", "😎"])


# ── Public API ──

def pick_sticker(keyword: str, db_session=None) -> str | None:
    """
    Pick a sticker matching the keyword.

    Priority:
      1. ChineseBQB GIF sticker URL (searches 5800+ Chinese stickers)
      2. Emoji character fallback

    Returns:
      - Image URL (string starting with http) → GIF sticker found
      - Emoji character(s) → fallback
      - None → nothing found
    """
    if not keyword.strip():
        return None

    # Try ChineseBQB GIF search
    urls = search_sticker_gif(keyword, max_results=10)
    if urls:
        result = random.choice(urls)
        print(f"[Sticker] 选中 GIF: {result[:60]}...")
        return result

    # Fall back to emoji
    emoji = _emoji_sticker(keyword)
    print(f"[Sticker] GIF 无结果，降级到 emoji: '{keyword}' → {emoji}")
    return emoji


def list_emoji_map() -> list[dict]:
    """Return the EMOJI_MAP as a list of {key, emojis} for the frontend."""
    return [{"key": k, "emojis": v} for k, v in EMOJI_MAP.items()]


def preload_index():
    """Preload the sticker index (call during startup)."""
    _load_index()
