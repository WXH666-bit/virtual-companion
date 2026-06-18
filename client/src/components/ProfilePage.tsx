import { useState, useEffect, useRef } from "react"
import { API } from "../App"
import "./ProfilePage.css"

interface UserProfile {
  name: string
  avatar: string | null
}

interface Props {
  onClose: () => void
  onProfileUpdate?: () => void
  apiHeaders: () => Record<string, string>
}

function ProfilePage({ onClose, onProfileUpdate, apiHeaders }: Props) {
  const [profile, setProfile] = useState<UserProfile>({ name: "我", avatar: null })
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [uploading, setUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${API}/api/profile`, { headers: apiHeaders() })
      .then((r) => r.json())
      .then((data) => {
        setProfile(data)
        setNameValue(data.name)
      })
  }, [])

  const handleNameSave = async () => {
    const name = nameValue.trim()
    if (!name) {
      setError("名字不能为空")
      return
    }
    try {
      const res = await fetch(`${API}/api/profile`, {
        method: "PUT",
        headers: apiHeaders(),
        body: JSON.stringify({ name }),
      })
      if (!res.ok) throw new Error("Failed")
      setProfile((prev) => ({ ...prev, name }))
      setEditingName(false)
      setSuccess("名字已更新")
      setTimeout(() => setSuccess(""), 1500)
      onProfileUpdate?.()
    } catch {
      setError("更新失败")
    }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const form = new FormData()
    form.append("file", file)

    try {
      const headers: Record<string, string> = {}
      if (apiHeaders().Authorization) headers["Authorization"] = apiHeaders().Authorization
      const res = await fetch(`${API}/api/profile/avatar`, {
        method: "POST",
        headers,
        body: form,
      })
      if (!res.ok) throw new Error("Failed")
      const data = await res.json()
      setProfile((prev) => ({ ...prev, avatar: data.avatar_url }))
      setSuccess("头像已更新")
      setTimeout(() => setSuccess(""), 1500)
      onProfileUpdate?.()
    } catch {
      setError("上传失败")
    } finally {
      setUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const handleAvatarDelete = async () => {
    try {
      await fetch(`${API}/api/profile/avatar`, { method: "DELETE", headers: apiHeaders() })
      setProfile((prev) => ({ ...prev, avatar: null }))
      setSuccess("头像已移除")
      setTimeout(() => setSuccess(""), 1500)
      onProfileUpdate?.()
    } catch {
      setError("删除失败")
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal profile-modal" onClick={(e) => e.stopPropagation()}>
        <h3>👤 个人主页</h3>

        {/* Avatar section */}
        <div className="profile-avatar-section">
          <div
            className="profile-avatar-wrap"
            onClick={() => avatarInputRef.current?.click()}
            title="点击更换头像"
          >
            {profile.avatar ? (
              <img
                className="profile-avatar-img"
                src={`${API}${profile.avatar}`}
                alt="头像"
              />
            ) : (
              <span className="profile-avatar-default">
                {profile.name.charAt(0)}
              </span>
            )}
            <span className="profile-avatar-badge">📷</span>
          </div>
          <div className="profile-avatar-actions">
            <button
              className="btn-profile-avatar"
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "上传中..." : "更换头像"}
            </button>
            {profile.avatar && (
              <button
                className="btn-profile-avatar-remove"
                onClick={handleAvatarDelete}
              >
                移除头像
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            style={{ display: "none" }}
            onChange={handleAvatarUpload}
          />
        </div>

        {/* Name section */}
        <div className="profile-name-section">
          <label className="profile-label">名字</label>
          {editingName ? (
            <div className="profile-name-edit">
              <input
                className="profile-name-input"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleNameSave()
                  if (e.key === "Escape") {
                    setNameValue(profile.name)
                    setEditingName(false)
                  }
                }}
                autoFocus
              />
              <button className="btn-save-name" onClick={handleNameSave}>
                保存
              </button>
              <button
                className="btn-cancel-name"
                onClick={() => {
                  setNameValue(profile.name)
                  setEditingName(false)
                }}
              >
                取消
              </button>
            </div>
          ) : (
            <div className="profile-name-display">
              <span className="profile-name-text">{profile.name}</span>
              <button
                className="btn-edit-name"
                onClick={() => setEditingName(true)}
              >
                ✏️
              </button>
            </div>
          )}
        </div>

        {error && <p className="editor-error">❌ {error}</p>}
        {success && <p className="editor-success">✅ {success}</p>}

        <button className="btn-close-modal" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}

export default ProfilePage
