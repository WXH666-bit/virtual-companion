import { useState } from "react"
import type { Conversation, Skill } from "../App"
import { API } from "../App"
import ChatBubble from "./ChatBubble"
import ChatInput from "./ChatInput"
import StickerPicker from "./StickerPicker"
import { useChat } from "../hooks/useChat"
import "./ChatWindow.css"

interface Props {
  conversation: Conversation | null
  skills: Skill[]
  userProfile: { name: string; avatar: string | null }
  authToken: string | null
}

function ChatWindow({ conversation, skills, userProfile, authToken }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const { messages, send, sending, error, clearError } = useChat(
    conversation?.id ?? null,
    authToken
  )

  if (!conversation) {
    return (
      <main className="chat-window empty">
        <div className="empty-state">
          <p>👋 选择一个对话，或创建新的</p>
        </div>
      </main>
    )
  }

  const currentSkill = skills.find((s) => s.id === conversation.skill_name)

  const handleSelectEmoji = (emoji: string) => {
    setPickerOpen(false)
    // Signal to ChatInput to insert emoji at cursor
    const event = new CustomEvent("insert-emoji", { detail: emoji })
    window.dispatchEvent(event)
  }

  const handleSelectGif = (url: string) => {
    setPickerOpen(false)
    const event = new CustomEvent("select-gif", { detail: url })
    window.dispatchEvent(event)
  }

  return (
    <main className="chat-window">
      <header className="chat-header">
        <div className="header-left">
          <div className="chat-avatar">
            {currentSkill?.avatar ? (
              <img
                className="chat-avatar-img"
                src={`${API}${currentSkill.avatar}`}
                alt={currentSkill.name}
              />
            ) : (
              <span className="chat-avatar-default">
                {(currentSkill?.name ?? conversation.skill_name).charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h3>{currentSkill?.name ?? conversation.skill_name}</h3>
          </div>
        </div>
      </header>

      <div className="messages-area" onClick={() => setPickerOpen(false)}>
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            stickerUrl={(msg as any).stickerUrl}
            stickerEmoji={(msg as any).stickerEmoji}
            userAvatar={userProfile.avatar ? `${API}${userProfile.avatar}` : null}
            skillAvatar={currentSkill?.avatar ? `${API}${currentSkill.avatar}` : null}
            userName={userProfile.name}
            skillName={currentSkill?.name ?? conversation.skill_name}
          />
        ))}
        {sending && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          <ChatBubble
            role="assistant"
            content="..."
            isStreaming
            userAvatar={userProfile.avatar ? `${API}${userProfile.avatar}` : null}
            skillAvatar={currentSkill?.avatar ? `${API}${currentSkill.avatar}` : null}
            userName={userProfile.name}
            skillName={currentSkill?.name ?? conversation.skill_name}
          />
        )}
      </div>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={clearError}>✕</button>
        </div>
      )}

      {pickerOpen && (
        <StickerPicker
          onSelectEmoji={handleSelectEmoji}
          onSelectGif={handleSelectGif}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <ChatInput
        onSend={(text, stickerUrl) => send(text, stickerUrl)}
        disabled={sending}
        onTogglePicker={() => setPickerOpen(!pickerOpen)}
        pickerOpen={pickerOpen}
      />
    </main>
  )
}

export default ChatWindow
