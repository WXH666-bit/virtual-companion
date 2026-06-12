"""Memory manager — sliding-window context for conversations."""
from db.models import Message


def build_context(messages: list[Message], max_turns: int = 20) -> list[dict]:
    """
    Build the API message list from DB message records.
    Keeps the last `max_turns` user-assistant pairs.
    Also applies simple pruning: each turn = (user_msg, assistant_msg).
    """
    # Convert to list of dicts
    all_msgs = [{"role": m.role, "content": m.content} for m in messages]

    # If over the limit, keep only recent pairs
    # A turn is roughly a user+assistant pair, so max_turns * 2 messages
    limit = max_turns * 2
    if len(all_msgs) > limit:
        all_msgs = all_msgs[-limit:]

    return all_msgs
