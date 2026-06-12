import { useState, useEffect, useCallback } from "react"
import Sidebar from "./components/Sidebar"
import ChatWindow from "./components/ChatWindow"
import SettingsModal from "./components/SettingsModal"
import SkillEditor from "./components/SkillEditor"
import ProfilePage from "./components/ProfilePage"
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

export const API = "http://localhost:58000"

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConv, setActiveConv] = useState<Conversation | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showSkillEditor, setShowSkillEditor] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [userProfile, setUserProfile] = useState<{
    name: string; avatar: string | null
  }>({ name: "我", avatar: null })

  const fetchConversations = async () => {
    const res = await fetch(`${API}/api/conversations`)
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
    const res = await fetch(`${API}/api/profile`)
    const data = await res.json()
    setUserProfile(data)
  }, [])

  useEffect(() => {
    fetchSkills()
    fetchProfile()
    fetchConversations().then((convs) => {
      if (convs.length > 0 && !activeConv) {
        setActiveConv(convs[0])
      }
    })
  }, [])

  const handleNewChat = async (skillName: string) => {
    const res = await fetch(`${API}/api/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_name: skillName }),
    })
    const conv = await res.json()
    setConversations((prev) => [conv, ...prev])
    setActiveConv(conv)
  }

  const handleDelete = async (id: number) => {
    await fetch(`${API}/api/conversations/${id}`, { method: "DELETE" })
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeConv?.id === id) {
      setActiveConv(null)
    }
  }

  const handleRename = async (id: number, title: string) => {
    await fetch(`${API}/api/conversations/${id}/rename`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    )
    if (activeConv?.id === id) {
      setActiveConv((prev) => (prev ? { ...prev, title } : prev))
    }
  }

  const handleChangeSkill = async (convId: number, skillName: string) => {
    await fetch(
      `${API}/api/conversations/${convId}/skill?skill_name=${skillName}`,
      { method: "PUT" }
    )
    setConversations((prev) =>
      prev.map((c) => (c.id === convId ? { ...c, skill_name: skillName } : c))
    )
    if (activeConv?.id === convId) {
      setActiveConv((prev) => (prev ? { ...prev, skill_name: skillName } : prev))
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

  return (
    <div className="app-container">
      <Sidebar
        conversations={conversations}
        activeId={activeConv?.id ?? null}
        skills={skills}
        userProfile={userProfile}
        onSelect={setActiveConv}
        onNewChat={handleNewChat}
        onDelete={handleDelete}
        onRename={handleRename}
        onOpenSettings={() => setShowSettings(true)}
        onOpenSkillEditor={() => setShowSkillEditor(true)}
        onOpenProfile={() => setShowProfile(true)}
      />
      <ChatWindow
        conversation={activeConv}
        skills={skills}
        onChangeSkill={handleChangeSkill}
        onTitleChange={handleRename}
      />
      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}
      {showSkillEditor && (
        <SkillEditor
          skills={skills}
          onCreated={handleSkillCreated}
          onDeleted={handleSkillDeleted}
          onClose={() => setShowSkillEditor(false)}
        />
      )}
      {showProfile && (
        <ProfilePage
          onClose={() => setShowProfile(false)}
          onProfileUpdate={fetchProfile}
        />
      )}
    </div>
  )
}

export default App
