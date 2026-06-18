import { useState, useEffect, useCallback, useRef } from "react"
import { API } from "../App"

interface Message {
  id: number
  role: "user" | "assistant"
  content: string
  stickerUrl?: string
  stickerEmoji?: string
}

export function useChat(conversationId: number | null, authToken?: string | null) {
  const [messages, setMessages] = useState<Message[]>([])
  const apiHeaders = (): Record<string, string> => {
    const h: Record<string, string> = { "Content-Type": "application/json" }
    if (authToken) h["Authorization"] = `Bearer ${authToken}`
    return h
  }
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const sendingRef = useRef(false)  // ref guard against double-send race

  // Load messages when conversation changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    fetch(`${API}/api/conversations/${conversationId}/messages`, {
      headers: apiHeaders(),
    })
      .then((r) => r.json())
      .then((data) =>
        setMessages(
          data.map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            stickerUrl: m.sticker_url || undefined,
            stickerEmoji: m.sticker_emoji || undefined,
          }))
        )
      )
  }, [conversationId])

  const send = useCallback(
    async (text: string, stickerUrl?: string) => {
      // Use ref for atomic guard (state is stale in closure)
      if (!conversationId || sendingRef.current) return
      sendingRef.current = true
      setSending(true)

      // Optimistic user message (with sticker if present)
      const tempId = Date.now()
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "user", content: text, stickerUrl },
      ])

      try {
        const res = await fetch(`${API}/api/chat/send`, {
          method: "POST",
          headers: apiHeaders(),
          body: JSON.stringify({
            conversation_id: conversationId,
            content: text,
            sticker_emoji: null,
            sticker_url: stickerUrl || null,
          }),
        })

        if (!res.ok) throw new Error("Network error")

        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let assistantContent = ""
        let assistantStickerUrl: string | undefined
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            // Process any remaining buffered data before exiting
            if (buffer.trim()) {
              const lines = buffer.split("\n")
              for (const line of lines) {
                if (!line.startsWith("data: ")) continue
                try {
                  const data = JSON.parse(line.slice(6))
                  if (data.done || data.error) {
                    sendingRef.current = false
                    setSending(false)
                  }
                } catch {}
              }
            } else {
              sendingRef.current = false
              setSending(false)
            }
            break
          }

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

            if (data.clean_text !== undefined) {
              assistantContent = data.clean_text
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last && last.role === "assistant" && last.id === tempId) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: data.clean_text },
                  ]
                }
                return prev
              })
            }

            if (data.sticker) {
              const stickerUpdate: any = {}
              if (data.sticker_type === "emoji") {
                stickerUpdate.stickerEmoji = data.sticker
              } else {
                stickerUpdate.stickerUrl = data.sticker
              }
              setMessages((prev) => {
                const last = prev[prev.length - 1]
                if (last && last.role === "assistant" && last.id === tempId) {
                  // Defensive: strip any residual [STICKER: ...] markers from content
                  const cleanContent = last.content.replace(
                    /\[STICKER[：:]\s*[^\]]*\s*\]/gi,
                    ""
                  ).trim().replace(/\n{3,}/g, "\n\n")
                  return [
                    ...prev.slice(0, -1),
                    { ...last, ...stickerUpdate, content: cleanContent },
                  ]
                }
                return prev
              })
            }

            if (data.done) {
              sendingRef.current = false
              setSending(false)
            }

            if (data.error) {
              setMessages((prev) => prev.filter((m) => m.id !== tempId))
              setError(data.error)
              sendingRef.current = false
              setSending(false)
            }
          }
        }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId))
        setError("网络连接失败，请确认后端已启动")
        sendingRef.current = false
        setSending(false)
      }
    },
    [conversationId]
  )

  const clearError = useCallback(() => setError(null), [])

  return { messages, send, sending, error, clearError, messagesEndRef }
}
