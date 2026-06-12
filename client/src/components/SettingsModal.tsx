import { useState, useEffect } from "react"
import { API } from "../App"
import "./SettingsModal.css"

interface Props {
  onClose: () => void
}

function SettingsModal({ onClose }: Props) {
  const [apiKey, setApiKey] = useState("")
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${API}/api/settings/api_key`)
      .then((r) => r.json())
      .then((d) => {
        if (d.value) setApiKey(d.value)
        setLoading(false)
      })
  }, [])

  const save = async () => {
    await fetch(`${API}/api/settings/api_key`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: apiKey.trim() }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ 设置</h3>

        <label className="setting-label">
          DeepSeek API Key
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            disabled={loading}
          />
        </label>
        <p className="setting-hint">
          去 <a href="https://platform.deepseek.com" target="_blank">platform.deepseek.com</a> 获取
        </p>

        <div className="modal-actions">
          <button className="btn-save" onClick={save}>
            {saved ? "✅ 已保存" : "保存"}
          </button>
          <button className="btn-cancel" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal
