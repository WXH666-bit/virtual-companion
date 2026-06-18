import "./ChatBubble.css"

interface Props {
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
  stickerUrl?: string
  stickerEmoji?: string
  userAvatar?: string | null
  skillAvatar?: string | null
  userName?: string
  skillName?: string
}

function ChatBubble({ role, content, isStreaming, stickerUrl, stickerEmoji, userAvatar, skillAvatar, userName, skillName }: Props) {
  const avatarUrl = role === "user" ? userAvatar : skillAvatar
  const fallbackChar = (role === "user" ? (userName || "我") : (skillName || "TA")).charAt(0)
  return (
    <div className={`bubble-row ${role}`}>
      <div className={`avatar ${role}`}>
        {avatarUrl ? (
          <img className="avatar-img" src={avatarUrl} alt="" />
        ) : (
          <span className="avatar-fallback">{fallbackChar}</span>
        )}
      </div>
      <div className="bubble-content">
        <div className={`bubble ${role} ${isStreaming ? "streaming" : ""}`}>
          {role === "assistant" && isStreaming ? (
            <span className="streaming-text">
              {content === "..." ? "..." : content}
              <span className="cursor">|</span>
            </span>
          ) : (
            <p>{content}</p>
          )}
        </div>
        {stickerUrl && (
          <img
            className="sticker-img"
            src={stickerUrl}
            alt="sticker"
            loading="lazy"
          />
        )}
        {stickerEmoji && (
          <span className="sticker-emoji">{stickerEmoji}</span>
        )}
      </div>
    </div>
  )
}

export default ChatBubble
