import { useState } from "react"
import "./ChatInput.css"

interface Props {
  onSend: (text: string) => void
  disabled: boolean
}

function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("")

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText("")
  }

  return (
    <div className="chat-input-bar">
      <input
        type="text"
        className="chat-input"
        placeholder="输入消息..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
        disabled={disabled}
      />
      <button
        className="send-btn"
        onClick={handleSend}
        disabled={disabled || !text.trim()}
      >
        发送
      </button>
    </div>
  )
}

export default ChatInput
