import { useState, useEffect, useCallback, useRef } from "react"
import { API } from "../App"

interface Message {
  id: number
  role: "user" | "assistant"
  content: string
}

export function useChat(conversationId: number | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    fetch(`${API}/api/conversations/${conversationId}/messages`)
      .then((r) => r.json())
      .then(setMessages)
  }, [conversationId])

  const send = useCallback(
    async (text: string) => {
      if (!conversationId || sending) return

      // Optimistic user message
      const tempId = Date.now()
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "user", content: text },
      ])
      setSending(true)

      try {
        const res = await fetch(
          `${API}/api/chat/send?conversation_id=${conversationId}&content=${encodeURIComponent(text)}`,
          { method: "POST" }
        )

        if (!res.ok) throw new Error("Network error")

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ""
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = JSON.parse(line.slice(6))

            if (data.token) {
              assistantContent += data.token
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last && last.role === "assistant" && last.id === tempId) {
                  // update streaming placeholder
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: assistantContent },
                  ]
                }
                return [
                  ...prev,
                  { id: tempId, role: "assistant", content: assistantContent },
                ]
              })
            }

            if (data.done) {
              // Reload messages from server to get correct IDs
              fetch(
                `${API}/api/conversations/${conversationId}/messages`
              )
                .then((r) => r.json())
                .then(setMessages)
              setSending(false)
            }

            if (data.error) {
              // Remove the optimistic user message and show error
              setMessages((prev) => prev.filter((m) => m.id !== tempId))
              setError(data.error)
              setSending(false)
            }
          }
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setError("网络连接失败，请确认后端已启动")
        setSending(false)
      }
    },
    [conversationId, sending]
  )

  const clearError = useCallback(() => setError(null), [])

  return { messages, send, sending, error, clearError, messagesEndRef }
}
