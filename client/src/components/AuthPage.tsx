import { useState } from "react"
import { API } from "../App"
import "./AuthPage.css"

interface Props {
  onLogin: (token: string, username: string) => void
}

function AuthPage({ onLogin }: Props) {
  const [tab, setTab] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError("请填写用户名和密码")
      return
    }
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`${API}/api/auth/${tab}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || "操作失败")
        return
      }
      onLogin(data.token, data.user.username)
    } catch {
      setError("网络连接失败，请确认后端已启动")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>🐾 Virtual Companion</h1>
        <p className="auth-subtitle">创建你的专属 AI 伴侣</p>

        <div className="auth-tabs">
          <button
            className={tab === "login" ? "active" : ""}
            onClick={() => { setTab("login"); setError("") }}
          >
            登录
          </button>
          <button
            className={tab === "register" ? "active" : ""}
            onClick={() => { setTab("register"); setError("") }}
          >
            注册
          </button>
        </div>

        <div className="auth-form">
          <input
            type="text"
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />
          {error && <p className="auth-error">{error}</p>}
          <button
            className="auth-submit"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "请稍候..." : tab === "login" ? "登录" : "注册"}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuthPage
