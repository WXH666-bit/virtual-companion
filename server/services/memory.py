"""Memory manager — sliding-window context for conversations."""
from db.models import Message


def build_context(messages: list[Message], max_turns: int = 20) -> list[dict]:
    """
    Build the API message list from DB message records.
    Keeps the last `max_turns` user-assistant pairs.

    Sticker usage is collected separately and inserted as a single system-level
    summary at the top of the context. This prevents the AI from learning to
    mimic annotation patterns that were previously appended to message content.
    """

    # Step 1: Build clean message dicts + collect sticker hints separately
    pairs: list[tuple[dict, str | None]] = []
    turn_index = 0
    last_role = None

    for m in messages:
        if m.role == "user" and last_role != "user":
            turn_index += 1
        last_role = m.role

        hint = None
        if getattr(m, "sticker_url", None):
            desc = getattr(m, "img_desc", None) or getattr(m, "_img_desc", None)
            if m.role == "assistant":
                hint = f"第{turn_index}轮：你发送了一张动图表情包"
            elif desc:
                hint = f"第{turn_index}轮：用户发送了一张动图表情包（内容：{desc}）"
            else:
                hint = f"第{turn_index}轮：用户发送了一张动图表情包"
        elif getattr(m, "sticker_emoji", None):
            if m.role == "assistant":
                hint = f"第{turn_index}轮：你发送了表情{m.sticker_emoji}"
            else:
                hint = f"第{turn_index}轮：用户发送了表情{m.sticker_emoji}"

        pairs.append(({"role": m.role, "content": m.content}, hint))

    # Step 2: Truncate to sliding window
    limit = max_turns * 2
    if len(pairs) > limit:
        pairs = pairs[-limit:]

    # Step 3: Build final message list + collect surviving sticker events
    all_msgs: list[dict] = []
    sticker_events: list[str] = []
    for msg_dict, hint in pairs:
        all_msgs.append(msg_dict)
        if hint:
            sticker_events.append(hint)

    # Step 4: Insert sticker summary as a standalone system message at the top.
    #         This reads as "system notification" and is not mistaken for the
    #         AI's own speech — breaking the mimicry feedback loop entirely.
    if sticker_events:
        summary = "；".join(sticker_events)
        system_note = {
            "role": "system",
            "content": (
                f"【贴纸使用记录】{summary}。"
                f"（这些信息仅供你了解上下文）"
            )
        }
        all_msgs.insert(0, system_note)

    return all_msgs
