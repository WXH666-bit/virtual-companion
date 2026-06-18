import { useState, useEffect, useCallback } from "react"
import Sidebar from "./components/Sidebar"
import ChatWindow from "./components/ChatWindow"
import SettingsModal from "./components/SettingsModal"
import SkillEditor from "./components/SkillEditor"
import ProfilePage from "./components/ProfilePage"
import AuthPage from "./components/AuthPage"
import "./App.css"

export interface Conversation {
  id: number
  title: string
  skill_name: string
  created_at: string
  updated_at: string
}

export interface Skill {
  id: string
  name: string
  description: string
  relationship: string
  mode?: "freeform" | "structured"
  avatar?: string | null
}

// API base URL — auto-detect so the app works on both localhost and LAN.
// LAN users connect to the same hostname as the frontend, port 58000.
// You can override with ?api=http://x.x.x.x:58000 in the browser URL.
export const API = (() => {
  const params = new URLSearchParams(window.location.search)
  const override = params.get("api")
  if (override) return override
  return `${window.location.protocol}//${window.location.hostname}:58000`
})()

function App() {
  // ── Auth state ──
  const [authToken, setAuthToken] = useState<string | null>(
    () => localStorage.getItem("auth_token")
  )
  const [authUser, setAuthUser] = useState<string | null>(
    () => localStorage.getItem("auth_user")
  )

  const apiHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (authToken) h["Authorization"] = `Bearer ${authToken}`
    return h
  }, [authToken])

  const handleLogin = (token: string, username: string) => {
    localStorage.setItem("auth_token", token)
    localStorage.setItem("auth_user", username)
    setAuthToken(token)
    setAuthUser(username)
  }

  const handleLogout = () => {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("auth_user")
    setAuthToken(null)
    setAuthUser(null)
    setConversations([])
    setActiveConv(null)
  }

  // ── App state ──
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showSkillEditor, setShowSkillEditor] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [userProfile, setUserProfile] = useState<{
    name: string; avatar: string | null
  }>({ name: authUser || "我", avatar: null })

  const fetchConversations = async () => {
    const res = await fetch(`${API}/api/conversations`, {
      headers: apiHeaders(),
    })
    const data = await res.json()
    setConversations(data)
    return data
  }

  const fetchSkills = async () => {
    const res = await fetch(`${API}/api/skills`)
    const data = await res.json()
    setSkills(data)
  }

  const fetchProfile = useCallback(async () => {
    const res = await fetch(`${API}/api/profile`, {
      headers: apiHeaders(),
    })
    const data = await res.json()
    setUserProfile(data)
  }, [apiHeaders])

  useEffect(() => {
    if (!authToken) return
    fetchSkills()
    fetchProfile()
    fetchConversations().then((convs) => {
      if (convs.length > 0 && !activeConv) {
        setActiveConv(convs[0])
      }
    })
  }, [authToken])

  const handleNewChat = async (skillName: string) => {
    const skill = skills.find(s => s.id === skillName)
    const title = skill?.name || skillName
    const res = await fetch(`${API}/api/conversations`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ skill_name: skillName, title }),
    })
    const conv = await res.json()
    setConversations((prev) => [conv, ...prev])
    setActiveConv(conv)
  }

  const handleCreatedAndChat = async (skillName: string) => {
    await fetchSkills()
    const freshRes = await fetch(`${API}/api/skills`)
    const freshSkills = await freshRes.json()
    const skill = freshSkills.find((s: Skill) => s.id === skillName)
    const title = skill?.name || skillName
    const res = await fetch(`${API}/api/conversations`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({ skill_name: skillName, title }),
    })
    const conv = await res.json()
    setConversations((prev) => [conv, ...prev])
    setActiveConv(conv)
  }

  const handleDelete = async (id: number) => {
    await fetch(`${API}/api/conversations/${id}`, {
      method: "DELETE",
      headers: apiHeaders(),
    })
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConv?.id === id) setActiveConv(null)
  }

  const handleRename = async (id: number, title: string) => {
    await fetch(`${API}/api/conversations/${id}/rename`, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify({ title }),
    })
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    )
    if (activeConv?.id === id) {
      setActiveConv((prev) => (prev ? { ...prev, title } : prev))
    }
  }

  const handleSkillCreated = () => {
    fetchSkills()
    setShowSkillEditor(false)
  }

  const handleSkillDeleted = async (skillId: string) => {
    await fetch(`${API}/api/skills/${skillId}`, { method: "DELETE" })
    fetchSkills()
  }

  const handleClearContext = async (skillId: string) => {
    await fetch(`${API}/api/skills/${skillId}/clear-context`, {
      method: "DELETE",
      headers: apiHeaders(),
    })
    fetchConversations()
  }

  // ── Render ──

  if (!authToken) {
    return <AuthPage onLogin={handleLogin} />
  }

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeId={activeConv?.id ?? null}
        skills={skills}
        userProfile={userProfile}
        onSelect={setActiveConv}
        onNewChat={handleNewChat}
        onCreatedAndChat={handleCreatedAndChat}
        onDelete={handleDelete}
        onRename={handleRename}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSkillEditor={() => setShowSkillEditor(true)}
        onOpenProfile={() => setShowProfile(true)}
        onLogout={handleLogout}
        apiHeaders={apiHeaders}
      />
      <ChatWindow
        conversation={activeConv}
        skills={skills}
        userProfile={userProfile}
        authToken={authToken}
      />
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} apiHeaders={apiHeaders} />
      )}
      {showSkillEditor && (
        <SkillEditor
          skills={skills}
          apiHeaders={apiHeaders}
          onCreated={handleSkillCreated}
          onDeleted={handleSkillDeleted}
          onClearContext={handleClearContext}
          onClose={() => setShowSkillEditor(false)}
        />
      )}
      {showProfile && (
        <ProfilePage
          onClose={() => setShowProfile(false)}
          onProfileUpdate={fetchProfile}
          apiHeaders={apiHeaders}
        />
      )}
    </div>
  )
}

export default App
