import { useState } from "react"
import type { Conversation, Skill } from "../App"
import { API } from "../App"
import SkillPicker from "./SkillPicker"
import "./Sidebar.css"

interface Props {
  conversations: Conversation[]
  activeId: number | null
  skills: Skill[]
  userProfile: { name: string; avatar: string | null }
  onSelect: (conv: Conversation) => void
  onNewChat: (skillName: string) => void
  onDelete: (id: number) => void
  onRename: (id: number, title: string) => void
  onOpenSettings: () => void
  onOpenSkillEditor: () => void
  onOpenProfile: () => void
}

function Sidebar({
  conversations,
  activeId,
  skills,
  userProfile,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
  onOpenSettings,
  onOpenSkillEditor,
  onOpenProfile,
}: Props) {
  const [showNewChat, setShowNewChat] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState("")

  const startRename = (conv: Conversation) => {
    setEditingId(conv.id)
    setEditTitle(conv.title)
  }

  const submitRename = (id: number) => {
    if (editTitle.trim()) {
      onRename(id, editTitle.trim())
    }
    setEditingId(null)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>💬 聊天伴侣</h2>
        <button
          className="btn-new"
          onClick={() => setShowNewChat(!showNewChat)}
        >
          ＋
        </button>
      </div>

      {showNewChat && (
        <SkillPicker
          skills={skills}
          onPick={(skillName) => {
            onNewChat(skillName)
            setShowNewChat(false)
          }}
          onClose={() => setShowNewChat(false)}
        />
      )}

      {/* User profile bar */}
      <div className="sidebar-user-bar" onClick={onOpenProfile}>
        <div className="sidebar-user-avatar">
          {userProfile.avatar ? (
            <img
              className="sidebar-user-avatar-img"
              src={`${API}${userProfile.avatar}`}
              alt={userProfile.name}
            />
          ) : (
            <span className="sidebar-user-avatar-default">
              {userProfile.name.charAt(0)}
            </span>
          )}
        </div>
        <span className="sidebar-user-name">{userProfile.name}</span>
        <span className="sidebar-user-arrow">›</span>
      </div>

      <div className="conv-list">
        {conversations.length === 0 && (
          <p className="empty-hint">点击 ＋ 开始新对话</p>
        )}
        {conversations.map((conv) => {
          const skill = skills.find((s) => s.id === conv.skill_name)
          return (
            <div
              key={conv.id}
              className={`conv-item ${conv.id === activeId ? "active" : ""}`}
              onClick={() => onSelect(conv)}
            >
              <div className="conv-avatar">
                {skill?.avatar ? (
                  <img
                    className="conv-avatar-img"
                    src={`${API}${skill.avatar}`}
                    alt={skill.name}
                  />
                ) : (
                  <span className="conv-avatar-default">
                    {(skill?.name ?? conv.skill_name).charAt(0)}
                  </span>
                )}
              </div>
              {editingId === conv.id ? (
                <input
                  className="rename-input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => submitRename(conv.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitRename(conv.id)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="conv-title"
                  onDoubleClick={() => startRename(conv)}
                >
                  {conv.title}
                </span>
              )}
              <span className="conv-skill-badge">{conv.skill_name}</span>
              <button
                className="btn-delete"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(conv.id)
                }}
                title="删除"
              >
                ✕
              </button>
            </div>
          )
        })}
      </div>

      <div className="sidebar-footer">
        <button className="footer-btn" onClick={onOpenSkillEditor}>
          🎭 角色管理
        </button>
        <button className="footer-btn" onClick={onOpenSettings}>
          ⚙️ 设置
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
