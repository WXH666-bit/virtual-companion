import { useState } from "react"
import type { Conversation, Skill } from "../App"
import { API } from "../App"
import ChatBubble from "./ChatBubble"
import ChatInput from "./ChatInput"
import { useChat } from "../hooks/useChat"
import "./ChatWindow.css"

interface Props {
  conversation: Conversation | null
  skills: Skill[]
  onChangeSkill: (convId: number, skillName: string) => void
  onTitleChange: (id: number, title: string) => void
}

function ChatWindow({ conversation, skills, onChangeSkill, onTitleChange }: Props) {
  const { messages, send, sending, error, clearError } = useChat(
    conversation?.id ?? null
  )
  const [skillMenuOpen, setSkillMenuOpen] = useState(false)

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
            <h3>{conversation.title}</h3>
            <div className="skill-tag" onClick={() => setSkillMenuOpen(!skillMenuOpen)}>
              {currentSkill?.name ?? conversation.skill_name}
              <span className="arrow">▾</span>
            </div>
          </div>
          {skillMenuOpen && (
            <div className="skill-menu">
              {skills.map((s) => (
                <button
                  key={s.id}
                  className={s.id === conversation.skill_name ? "active" : ""}
                  onClick={() => {
                    onChangeSkill(conversation.id, s.id)
                    setSkillMenuOpen(false)
                  }}
                >
                  {s.name} — {s.relationship}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="messages-area">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} role={msg.role} content={msg.content} />
        ))}
        {sending && (
          <ChatBubble role="assistant" content="..." isStreaming />
        )}
      </div>

      {error && (
        <div className="error-bar">
          <span>{error}</span>
          <button onClick={clearError}>✕</button>
        </div>
      )}
      <ChatInput onSend={(text) => send(text)} disabled={sending} />
    </main>
  )
}

export default ChatWindow
