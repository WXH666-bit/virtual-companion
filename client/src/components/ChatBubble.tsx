import "./ChatBubble.css"

interface Props {
  role: "user" | "assistant"
  content: string
  isStreaming?: boolean
}

function ChatBubble({ role, content, isStreaming }: Props) {
  return (
    <div className={`bubble-row ${role}`}>
      <div className={`avatar ${role}`}>
        {role === "user" ? "我" : "TA"}
      </div>
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
    </div>
  )
}

export default ChatBubble
