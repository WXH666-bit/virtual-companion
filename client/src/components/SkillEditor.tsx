import { useState, useRef } from "react"
import type { Skill } from "../App"
import { API } from "../App"
import "./SkillEditor.css"

const BUILTIN = new Set(["girlfriend", "bestie", "mentor"])

interface Props {
  skills: Skill[]
  apiHeaders: () => Record<string, string>
  onCreated: () => void
  onDeleted: (skillId: string) => void
  onClearContext?: (skillId: string) => void
  onClose: () => void
}

type Mode = "list" | "pick" | "edit"

function SkillEditor({ skills, apiHeaders, onCreated, onDeleted, onClearContext, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("list")
  const [error, setError] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarSkillId, setAvatarSkillId] = useState<string | null>(null)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrompt, setEditPrompt] = useState("")
  const [editName, setEditName] = useState("")
  const [editRelationship, setEditRelationship] = useState("朋友")
  const [editSaving, setEditSaving] = useState(false)
  const [editOptimizing, setEditOptimizing] = useState(false)

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const skillId = avatarSkillId
    if (!file || !skillId) return
    const form = new FormData()
    form.append("file", file)
    try {
      const res = await fetch(`${API}/api/skills/${skillId}/avatar`, { method: "POST", body: form })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail) }
      onCreated()
    } catch (e: any) { setError(e.message) }
    finally {
      setAvatarSkillId(null)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const handleAvatarDelete = async (skillId: string) => {
    try {
      const res = await fetch(`${API}/api/skills/${skillId}/avatar`, { method: "DELETE" })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail) }
      onCreated()
    } catch (e: any) { setError(e.message) }
  }

  const handleRenameSubmit = async (skillId: string) => {
    const newName = renameValue.trim()
    if (!newName) { setRenamingId(null); return }
    try {
      const res = await fetch(`${API}/api/skills/${skillId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail) }
      onCreated()
    } catch (e: any) { setError(e.message) }
    setRenamingId(null)
  }

  // Open editor for a selected skill
  const openEditor = async (skillId: string) => {
    setError("")
    try {
      const res = await fetch(`${API}/api/skills/${skillId}`)
      if (!res.ok) throw new Error("加载失败")
      const skill = await res.json()
      setEditName(skill.name || "")
      setEditRelationship(skill.relationship || "朋友")
      if (skill.raw_prompt) {
        setEditPrompt(skill.raw_prompt)
      } else {
        const parts = []
        if (skill.personality) parts.push(`性格：${skill.personality}`)
        if (skill.backstory) parts.push(`背景：${skill.backstory}`)
        if (skill.speaking_style) parts.push(`说话风格：${skill.speaking_style}`)
        if (skill.example_dialogue?.length) {
          parts.push("示例对话：")
          for (const ex of skill.example_dialogue) {
            parts.push(`用户：${ex.user}\n${skill.name}：${ex.reply}`)
          }
        }
        setEditPrompt(parts.join("\n\n"))
      }
      setEditingId(skillId)
      setMode("edit")
    } catch (e: any) {
      setError(e.message)
    }
  }

  const closeEditor = () => {
    setEditingId(null)
    setEditPrompt("")
    setEditName("")
    setEditRelationship("朋友")
    setError("")
    setMode("list")
  }

  const handleEditSave = async () => {
    if (!editingId) return
    setEditSaving(true)
    setError("")
    try {
      const res = await fetch(`${API}/api/skills/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_prompt: editPrompt.trim(),
          name: editName.trim() || undefined,
          relationship: editRelationship,
        }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail) }
      onCreated()
      closeEditor()
    } catch (e: any) { setError(e.message) }
    finally { setEditSaving(false) }
  }

  const handleEditOptimize = async () => {
    if (!editPrompt.trim()) { setError("请先输入角色描述"); return }
    setEditOptimizing(true)
    setError("")
    try {
      const res = await fetch(`${API}/api/skills/optimize-prompt`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ prompt: editPrompt.trim() }),
      })
      if (!res.ok) { const err = await res.json(); throw new Error(err.detail || "优化失败") }
      const data = await res.json()
      setEditPrompt(data.optimized)
    } catch (e: any) { setError(e.message) }
    finally { setEditOptimizing(false) }
  }

  // ── View: Role picker ──

  if (mode === "pick") {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal skill-editor-modal" onClick={e => e.stopPropagation()}>
          <h3>选择要修改的角色</h3>
          <button className="ncp-back" onClick={() => { setMode("list"); setError("") }}>
            ← 返回
          </button>
          <div className="ncp-skill-list">
            {skills.filter(s => !BUILTIN.has(s.id)).map(s => (
              <button key={s.id} className="ncp-skill-card" onClick={() => openEditor(s.id)}>
                <div className="ncp-skill-avatar">
                  {s.avatar ? (
                    <img src={`${API}${s.avatar}`} alt={s.name} />
                  ) : (
                    <span>{s.name.charAt(0)}</span>
                  )}
                </div>
                <div className="ncp-skill-info">
                  <span className="ncp-skill-name">{s.name}</span>
                  <span className="ncp-skill-rel">{s.relationship}</span>
                  <span className="ncp-skill-desc">{s.description}</span>
                </div>
              </button>
            ))}
          </div>
          {error && <p className="editor-error">❌ {error}</p>}
          <button className="btn-close-modal" onClick={onClose}>关闭</button>
        </div>
      </div>
    )
  }

  // ── View: Prompt editor ──

  if (mode === "edit") {
    const skillName = skills.find(s => s.id === editingId)?.name || editName
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal skill-editor-modal" onClick={e => e.stopPropagation()}>
          <h3>📝 修改 · {skillName}</h3>
          <p className="editor-hint">修改角色描述，保存后新对话生效（已有对话不受影响）</p>
          <div className="freeform-meta">
            <label>
              名字
              <input type="text" value={editName} onChange={e => setEditName(e.target.value)} />
            </label>
            <label>
              关系
              <select value={editRelationship} onChange={e => setEditRelationship(e.target.value)}>
                <option>恋人</option><option>朋友</option><option>导师</option>
                <option>家人</option><option>陌生人</option><option>其他</option>
              </select>
            </label>
          </div>
          <textarea
            className="skill-freeform-editor"
            value={editPrompt}
            onChange={e => setEditPrompt(e.target.value)}
            placeholder="描述角色的性格、说话方式、背景故事、你们的关系……"
          />
          {error && <p className="editor-error">❌ {error}</p>}
          <div className="ncp-actions" style={{ marginTop: 10 }}>
            <button className="ncp-save" onClick={handleEditSave} disabled={editSaving || editOptimizing}>
              {editSaving ? "保存中..." : "保存"}
            </button>
            <button
              className="ncp-optimize"
              onClick={handleEditOptimize}
              disabled={editOptimizing || editSaving}
            >
              {editOptimizing ? "优化中..." : "✨ AI 精简"}
            </button>
            <button className="ncp-cancel" onClick={() => { setMode("pick"); setError("") }}>
              换一个
            </button>
          </div>
          <button className="btn-close-modal" style={{ marginTop: 8 }} onClick={closeEditor}>关闭</button>
        </div>
      </div>
    )
  }

  // ── View: Skill list (default) ──

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal skill-editor-modal" onClick={e => e.stopPropagation()}>
        <h3>🎭 角色管理</h3>

        <div className="skill-list-mini">
          {skills.filter(s => !BUILTIN.has(s.id)).map(s => (
            <div key={s.id} className="skill-row">
              <div className="skill-row-left">
                <div className="skill-row-avatar-wrap">
                  {s.avatar ? (
                    <img className="skill-row-avatar" src={`${API}${s.avatar}`} alt={s.name} />
                  ) : (
                    <span className="skill-row-avatar-default">{s.name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  {renamingId === s.id ? (
                    <input
                      className="rename-inline-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(s.id)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleRenameSubmit(s.id)
                        if (e.key === "Escape") setRenamingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                    />
                  ) : (
                    <span className="skill-name">{s.name}</span>
                  )}
                  <span className="skill-rel-tag">{s.relationship}</span>
                </div>
              </div>
              <div className="skill-row-actions">
                <button className="btn-action-avatar" onClick={() => {
                  setAvatarSkillId(s.id); avatarInputRef.current?.click()
                }} title="更换头像">🖼️</button>
                <button className="btn-action-rename" onClick={() => {
                  setRenamingId(s.id); setRenameValue(s.name)
                }} title="重命名">✏️</button>
                {s.avatar && (
                  <button className="btn-action-del-avatar" onClick={() => handleAvatarDelete(s.id)} title="移除头像">🚫</button>
                )}
                <button className="btn-clear-context" onClick={() => {
                  if (window.confirm(`确定要清空与「${s.name}」的所有对话历史吗？此操作不可撤销。`)) {
                    onClearContext?.(s.id)
                  }
                }} title="清空对话上下文">🗑️</button>
                {!BUILTIN.has(s.id) && (
                  <button className="btn-delete-skill" onClick={() => onDeleted(s.id)}>删除</button>
                )}
              </div>
            </div>
          ))}
        </div>

        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: "none" }} onChange={handleAvatarUpload} />

        {error && <p className="editor-error">❌ {error}</p>}
        <div className="skill-editor-footer">
          <button className="btn-primary-action" onClick={() => { setMode("pick"); setError("") }}>
            📝 修改内容
          </button>
          <button className="btn-close-modal" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

export default SkillEditor
