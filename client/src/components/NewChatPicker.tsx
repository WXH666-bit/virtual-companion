import { useState, useRef, useEffect } from "react"
import type { Skill } from "../App"
import { API } from "../App"
import "./NewChatPicker.css"

interface Props {
  skills: Skill[]
  apiHeaders: () => Record<string, string>
  onPick: (skillName: string) => void
  onCreated: (skillName: string) => void
  onClose: () => void
}

type Mode = "menu" | "existing" | "template" | "custom"
type TemplateId = "girlfriend" | "bestie" | "mentor"

interface TemplateInfo {
  id: TemplateId
  name: string
  relationship: string
  description: string
}

const TEMPLATES: TemplateInfo[] = [
  { id: "girlfriend", name: "小雨", relationship: "恋人", description: "温柔体贴的女友，善解人意，会关心你的日常" },
  { id: "bestie", name: "阿杰", relationship: "朋友", description: "幽默风趣的死党，可以无话不谈的好兄弟" },
  { id: "mentor", name: "林老师", relationship: "导师", description: "睿智的人生导师，给你建议和指引方向" },
]

function NewChatPicker({ skills, apiHeaders, onPick, onCreated, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("menu")
  // Custom creation state
  const [name, setName] = useState("")
  const [relationship, setRelationship] = useState("恋人")
  const [prompt, setPrompt] = useState("")
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [optimizing, setOptimizing] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Reset form
  const resetForm = () => {
    setName(""); setRelationship("恋人"); setPrompt("")
    setAvatarFile(null); setAvatarPreview(null); setError("")
  }

  // Handle avatar file selection
  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setAvatarFile(f)
      const reader = new FileReader()
      reader.onload = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(f)
    }
  }

  // Load template data from server
  const loadTemplate = async (tid: TemplateId) => {
    try {
      const res = await fetch(`${API}/api/skills/${tid}`)
      if (!res.ok) throw new Error("Failed")
      const skill = await res.json()
      const template = TEMPLATES.find(t => t.id === tid)
      setName(template?.name || skill.name || "")
      setRelationship(template?.relationship || skill.relationship || "朋友")
      // Extract prompt from template
      if (skill.raw_prompt) {
        setPrompt(skill.raw_prompt)
      } else {
        // Assemble structured prompt into freeform
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
        setPrompt(parts.join("\n\n"))
      }
      setMode("template")
    } catch (e: any) {
      setError(e.message)
    }
  }

  // Upload avatar for a skill
  const uploadAvatar = async (skillId: string) => {
    if (!avatarFile) return
    const form = new FormData()
    form.append("file", avatarFile)
    await fetch(`${API}/api/skills/${skillId}/avatar`, { method: "POST", body: form })
  }

  // Create skill and return its ID
  const createSkill = async (data: object, fileName: string): Promise<string> => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const form = new FormData()
    form.append("file", blob, `${fileName}.json`)
    const res = await fetch(`${API}/api/skills/upload`, { method: "POST", body: form })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || "Upload failed")
    }
    const result = await res.json()
    return result.id
  }

  // Handle save (template mode or custom mode)
  const handleSave = async () => {
    const trimmedName = name.trim()
    const trimmedPrompt = prompt.trim()
    if (!trimmedName) { setError("请输入角色名字"); return }
    if (!trimmedPrompt) { setError("请输入角色描述"); return }

    setSaving(true)
    try {
      const data = {
        name: trimmedName,
        description: `${relationship} · 自定义`,
        relationship,
        raw_prompt: trimmedPrompt,
      }
      const skillId = await createSkill(data, trimmedName)
      // Upload avatar if selected
      if (avatarFile) await uploadAvatar(skillId)
      onCreated(skillId)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  // AI optimize prompt
  const handleOptimize = async () => {
    const trimmedPrompt = prompt.trim()
    if (!trimmedPrompt) { setError("请先输入角色描述"); return }
    setOptimizing(true)
    setError("")
    try {
      const res = await fetch(`${API}/api/skills/optimize-prompt`, {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ prompt: trimmedPrompt }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "优化失败")
      }
      const data = await res.json()
      setPrompt(data.optimized)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setOptimizing(false)
    }
  }

  const btnBack = mode !== "menu" ? (
    <button className="ncp-back" onClick={() => { setMode("menu"); resetForm() }}>
      ← 返回
    </button>
  ) : null

  if (mode === "menu") {
    return (
      <div className="ncp-overlay" onClick={onClose}>
        <div className="ncp" onClick={e => e.stopPropagation()}>
          <h3>新建对话</h3>
          <div className="ncp-menu">
            <button className="ncp-menu-btn" onClick={() => setMode("existing")}>
              <span className="ncp-icon">💬</span>
              <div>
                <strong>选择已有角色</strong>
                <small>从现有角色中选一个开始聊天</small>
              </div>
            </button>
            <button className="ncp-menu-btn" onClick={() => setMode("template")}>
              <span className="ncp-icon">🎭</span>
              <div>
                <strong>从模板创建</strong>
                <small>使用预设模板，可修改人设和名字</small>
              </div>
            </button>
            <button className="ncp-menu-btn" onClick={() => { resetForm(); setMode("custom") }}>
              <span className="ncp-icon">✨</span>
              <div>
                <strong>自定义创建</strong>
                <small>从零开始定义你的专属角色</small>
              </div>
            </button>
          </div>
          <button className="ncp-close" onClick={onClose}>取消</button>
        </div>
      </div>
    )
  }

  if (mode === "existing") {
    return (
      <div className="ncp-overlay" onClick={onClose}>
        <div className="ncp" onClick={e => e.stopPropagation()}>
          <h3>选择角色</h3>
          {btnBack}
          <div className="ncp-skill-list">
            {skills.map(s => (
              <button key={s.id} className="ncp-skill-card" onClick={() => onPick(s.id)}>
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
          <button className="ncp-close" onClick={onClose}>取消</button>
        </div>
      </div>
    )
  }

  // Template list (before picking one)
  if (mode === "template" && !prompt) {
    return (
      <div className="ncp-overlay" onClick={onClose}>
        <div className="ncp" onClick={e => e.stopPropagation()}>
          <h3>从模板创建</h3>
          {btnBack}
          <p className="ncp-hint">选一个模板，你可以在此基础上修改人设和名字</p>
          <div className="ncp-skill-list">
            {TEMPLATES.map(t => (
              <button key={t.id} className="ncp-skill-card" onClick={() => loadTemplate(t.id)}>
                <div className="ncp-skill-avatar">
                  {skills.find(s => s.id === t.id)?.avatar ? (
                    <img src={`${API}${skills.find(s => s.id === t.id)!.avatar}`} alt={t.name} />
                  ) : (
                    <span>{t.name.charAt(0)}</span>
                  )}
                </div>
                <div className="ncp-skill-info">
                  <span className="ncp-skill-name">{t.name}</span>
                  <span className="ncp-skill-rel">{t.relationship}</span>
                  <span className="ncp-skill-desc">{t.description}</span>
                </div>
              </button>
            ))}
          </div>
          <button className="ncp-close" onClick={onClose}>取消</button>
        </div>
      </div>
    )
  }

  // Template edit form OR custom form
  const isTemplate = mode === "template" && !!prompt
  return (
    <div className="ncp-overlay" onClick={onClose}>
      <div className="ncp ncp-form" onClick={e => e.stopPropagation()}>
        <h3>{isTemplate ? "修改角色" : "自定义角色"}</h3>
        {btnBack}

        {/* Avatar */}
        <div className="ncp-avatar-row">
          <div className="ncp-avatar-preview" onClick={() => avatarInputRef.current?.click()}>
            {avatarPreview ? (
              <img src={avatarPreview} alt="" />
            ) : (
              <span>{name ? name.charAt(0) : "?"}</span>
            )}
          </div>
          <button className="ncp-avatar-btn" onClick={() => avatarInputRef.current?.click()}>
            {avatarPreview ? "更换头像" : "添加头像"}
          </button>
          <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp"
            style={{ display: "none" }} onChange={handleAvatarPick} />
        </div>

        {/* Name & Relationship */}
        <div className="ncp-meta-row">
          <label>
            名字
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="角色名字" />
          </label>
          <label>
            关系
            <select value={relationship} onChange={e => setRelationship(e.target.value)}>
              <option>恋人</option><option>朋友</option><option>导师</option>
              <option>家人</option><option>陌生人</option><option>其他</option>
            </select>
          </label>
        </div>

        {/* Prompt */}
        <label className="ncp-prompt-label">
          角色描述
          <textarea className="ncp-prompt" value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder="描述角色的性格、说话方式、背景故事、你们的关系……越详细越像。" rows={12} />
        </label>

        {error && <p className="ncp-error">❌ {error}</p>}

        <div className="ncp-actions">
          <button className="ncp-save" onClick={handleSave} disabled={saving || optimizing}>
            {saving ? "创建中..." : "创建并开始聊天"}
          </button>
          <button
            className="ncp-optimize"
            onClick={handleOptimize}
            disabled={optimizing || saving}
          >
            {optimizing ? "优化中..." : "✨ AI 精简"}
          </button>
          <button className="ncp-cancel" onClick={onClose}>取消</button>
        </div>
      </div>
    </div>
  )
}

export default NewChatPicker
