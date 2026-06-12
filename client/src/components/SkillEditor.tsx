import { useState, useRef } from "react"
import type { Skill } from "../App"
import { API } from "../App"
import "./SkillEditor.css"

const BUILTIN = new Set(["girlfriend", "bestie", "mentor"])

interface Props {
  skills: Skill[]
  onCreated: () => void
  onDeleted: (skillId: string) => void
  onClose: () => void
}

const EMPTY_JSON = JSON.stringify(
  {
    name: "新角色",
    description: "",
    relationship: "朋友",
    personality: "",
    backstory: "",
    speaking_style: "",
    example_dialogue: [{ user: "", reply: "" }],
  },
  null,
  2
)

function SkillEditor({ skills, onCreated, onDeleted, onClose }: Props) {
  const [mode, setMode] = useState<"list" | "freeform" | "json" | "import">(
    "list"
  )
  const [jsonText, setJsonText] = useState(EMPTY_JSON)
  const [freeformText, setFreeformText] = useState("")
  const [freeformName, setFreeformName] = useState("")
  const [freeformRel, setFreeformRel] = useState("恋人")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [uploadingAvatar, setUploadingAvatar] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const txtInputRef = useRef<HTMLInputElement>(null)
  const [avatarSkillId, setAvatarSkillId] = useState<string | null>(null)

  const upload = async (data: object, fileName: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    })
    const form = new FormData()
    form.append("file", blob, `${fileName}.json`)

    const res = await fetch(`${API}/api/skills/upload`, {
      method: "POST",
      body: form,
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || "Upload failed")
    }
  }

  const handleCreateFreeform = async () => {
    if (!freeformName.trim()) {
      setError("请输入角色名字")
      return
    }
    if (!freeformText.trim()) {
      setError("请输入角色描述")
      return
    }
    try {
      const data = {
        name: freeformName.trim(),
        description: `${freeformRel} · 长描述模式`,
        relationship: freeformRel,
        raw_prompt: freeformText.trim(),
      }
      const fileName = freeformName.trim()
      await upload(data, fileName)
      setSuccess(`${fileName} 创建成功！`)
      setError("")
      setTimeout(() => {
        onCreated()
        setMode("list")
        setSuccess("")
      }, 800)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleCreateJson = async () => {
    try {
      const data = JSON.parse(jsonText)
      if (!data.name) throw new Error("缺少 name 字段")
      const fileName =
        prompt("保存为文件名（不含扩展名）：", data.name) || data.name
      await upload(data, fileName)
      setSuccess(`${fileName} 创建成功！`)
      setError("")
      setTimeout(() => {
        onCreated()
        setMode("list")
        setSuccess("")
      }, 800)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch(`${API}/api/skills/upload`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Import failed")
      }
      setSuccess(`${file.name} 导入成功！`)
      setError("")
      setTimeout(() => {
        onCreated()
        setMode("list")
        setSuccess("")
      }, 800)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const skillId = avatarSkillId
    if (!file || !skillId) return

    setUploadingAvatar(skillId)
    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch(`${API}/api/skills/${skillId}/avatar`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Upload failed")
      }
      onCreated() // refresh skill list
    } catch (e: any) {
      setError(e.message)
    } finally {
      setUploadingAvatar(null)
      setAvatarSkillId(null)
      // Reset file input so the same file can be re-selected
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const handleAvatarDelete = async (skillId: string) => {
    try {
      const res = await fetch(`${API}/api/skills/${skillId}/avatar`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Delete failed")
      }
      onCreated() // refresh skill list
    } catch (e: any) {
      setError(e.message)
    }
  }

  const handleRenameStart = (skill: Skill) => {
    setRenamingId(skill.id)
    setRenameValue(skill.name)
  }

  const handleRenameSubmit = async (skillId: string) => {
    const newName = renameValue.trim()
    if (!newName) {
      setRenamingId(null)
      return
    }
    try {
      const res = await fetch(`${API}/api/skills/${skillId}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Rename failed")
      }
      onCreated() // refresh skill list
    } catch (e: any) {
      setError(e.message)
    }
    setRenamingId(null)
  }

  const handleTxtImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch(`${API}/api/skills/upload`, {
        method: "POST",
        body: form,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Import failed")
      }
      setSuccess(`${file.name} 导入成功！`)
      setError("")
      setTimeout(() => {
        onCreated()
        setMode("list")
        setSuccess("")
      }, 800)
    } catch (e: any) {
      setError(e.message)
    }
    // Reset input
    if (txtInputRef.current) txtInputRef.current.value = ""
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal skill-editor-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h3>🎭 角色管理</h3>

        {mode === "list" && (
          <>
            <div className="skill-list-mini">
              {skills.map((s) => (
                <div key={s.id} className="skill-row">
                  <div className="skill-row-left">
                    <div className="skill-row-avatar-wrap">
                      {s.avatar ? (
                        <img
                          className="skill-row-avatar"
                          src={`${API}${s.avatar}`}
                          alt={s.name}
                        />
                      ) : (
                        <span className="skill-row-avatar-default">
                          {s.name.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div>
                      {renamingId === s.id ? (
                        <input
                          className="rename-inline-input"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => handleRenameSubmit(s.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameSubmit(s.id)
                            if (e.key === "Escape") setRenamingId(null)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (
                        <span className="skill-name">{s.name}</span>
                      )}
                      <span className="skill-rel-tag">{s.relationship}</span>
                    </div>
                  </div>
                  <div className="skill-row-actions">
                    <button
                      className="btn-action-avatar"
                      onClick={() => {
                        setAvatarSkillId(s.id)
                        avatarInputRef.current?.click()
                      }}
                      title="更换头像"
                    >
                      🖼️
                    </button>
                    <button
                      className="btn-action-rename"
                      onClick={() => handleRenameStart(s)}
                      title="重命名"
                    >
                      ✏️
                    </button>
                    {s.avatar && (
                      <button
                        className="btn-action-del-avatar"
                        onClick={() => handleAvatarDelete(s.id)}
                        title="移除头像"
                      >
                        🚫
                      </button>
                    )}
                    {!BUILTIN.has(s.id) && (
                      <button
                        className="btn-delete-skill"
                        onClick={() => onDeleted(s.id)}
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Hidden file inputs for uploads */}
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              style={{ display: "none" }}
              onChange={handleAvatarUpload}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={handleFileImport}
            />
            <input
              ref={txtInputRef}
              type="file"
              accept=".txt"
              style={{ display: "none" }}
              onChange={handleTxtImport}
            />

            <div className="skill-editor-actions">
              <button
                className="btn-create btn-primary-action"
                onClick={() => {
                  setFreeformText("")
                  setFreeformName("")
                  setFreeformRel("恋人")
                  setMode("freeform")
                  setError("")
                }}
              >
                📝 长文本描述角色
              </button>
              <button
                className="btn-create"
                onClick={() => {
                  setJsonText(EMPTY_JSON)
                  setMode("json")
                  setError("")
                }}
              >
                ✍️ JSON 编辑器
              </button>
            </div>
            <div className="skill-editor-actions">
              <button
                className="btn-import"
                onClick={() => fileInputRef.current?.click()}
              >
                📄 导入 JSON 文件
              </button>
              <button
                className="btn-import"
                onClick={() => txtInputRef.current?.click()}
              >
                📃 导入文本文件
              </button>
            </div>
            <div className="skill-editor-actions">
              <button className="btn-close-modal" onClick={onClose}>
                关闭
              </button>
            </div>
          </>
        )}

        {mode === "freeform" && (
          <>
            <p className="editor-hint">
              写一段长文描述你的角色——越详细越像。名字、性格、说话方式、背景故事、你们的关系……
              尽情发挥。
            </p>

            <div className="freeform-meta">
              <label>
                角色名字
                <input
                  type="text"
                  value={freeformName}
                  onChange={(e) => setFreeformName(e.target.value)}
                  placeholder="我的女友"
                />
              </label>
              <label>
                关系
                <select
                  value={freeformRel}
                  onChange={(e) => setFreeformRel(e.target.value)}
                >
                  <option>恋人</option>
                  <option>朋友</option>
                  <option>导师</option>
                  <option>家人</option>
                  <option>陌生人</option>
                  <option>其他</option>
                </select>
              </label>
            </div>

            <textarea
              className="skill-freeform-editor"
              value={freeformText}
              onChange={(e) => setFreeformText(e.target.value)}
              placeholder={`比如：

她是一个很特别的女孩……

她说话的方式是这样的……

她的性格是……

她和我之间的关系……

她最喜欢做的事情……

她的口头禅……

我们的共同回忆……`}
              rows={16}
            />

            {error && <p className="editor-error">❌ {error}</p>}
            {success && <p className="editor-success">✅ {success}</p>}

            <div className="modal-actions">
              <button className="btn-save" onClick={handleCreateFreeform}>
                保存
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  setMode("list")
                  setError("")
                  setSuccess("")
                }}
              >
                返回
              </button>
            </div>
          </>
        )}

        {mode === "json" && (
          <>
            <p className="editor-hint">
              编辑 JSON 定义角色。name 必填，其他可选。
            </p>
            <textarea
              className="skill-json-editor"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={18}
              spellCheck={false}
            />
            {error && <p className="editor-error">❌ {error}</p>}
            {success && <p className="editor-success">✅ {success}</p>}
            <div className="modal-actions">
              <button className="btn-save" onClick={handleCreateJson}>
                保存
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  setMode("list")
                  setError("")
                  setSuccess("")
                }}
              >
                返回
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default SkillEditor
