import { useState, useRef, useEffect } from "react"
import "./ChatInput.css"

interface Props {
  onSend: (text: string, stickerUrl?: string) => void
  disabled: boolean
  onTogglePicker: () => void
  pickerOpen: boolean
}

function ChatInput({ onSend, disabled, onTogglePicker, pickerOpen }: Props) {
  const [text, setText] = useState("")
  const [stickerUrl, setStickerUrl] = useState<string | undefined>()
  const textRef = useRef("")
  const inputRef = useRef<HTMLInputElement>(null)
  const lockRef = useRef(false)

  // Listen for emoji insert from ChatWindow's StickerPicker
  useEffect(() => {
    const onEmoji = (e: Event) => {
      const emoji = (e as CustomEvent).detail as string
      const input = inputRef.current
      if (input) {
        const start = input.selectionStart ?? textRef.current.length
        const end = input.selectionEnd ?? start
        const before = textRef.current.slice(0, start)
        const after = textRef.current.slice(end)
        const newText = before + emoji + after
        textRef.current = newText
        setText(newText)
        requestAnimationFrame(() => {
          const pos = start + emoji.length
          input.setSelectionRange(pos, pos)
          input.focus()
        })
      }
    }
    const onGif = (e: Event) => {
      setStickerUrl((e as CustomEvent).detail as string)
    }
    window.addEventListener("insert-emoji", onEmoji)
    window.addEventListener("select-gif", onGif)
    return () => {
      window.removeEventListener("insert-emoji", onEmoji)
      window.removeEventListener("select-gif", onGif)
    }
  }, [])

  const handleSend = () => {
    if (lockRef.current || disabled) return
    const trimmed = textRef.current.trim()
    if (!trimmed && !stickerUrl) return

    lockRef.current = true
    textRef.current = ""
    setText("")
    onSend(trimmed, stickerUrl)
    setStickerUrl(undefined)
    setTimeout(() => { lockRef.current = false }, 500)
  }

  const clearSticker = () => {
    setStickerUrl(undefined)
  }

  const canSend = text.trim() || stickerUrl

  return (
    <div className="chat-input-bar">
      <button
        type="button"
        className={`sticker-toggle-btn${pickerOpen ? " active" : ""}`}
        onClick={onTogglePicker}
        title="表情包"
      >
        😊
      </button>

      {stickerUrl && (
        <span
          className="sticker-preview sticker-preview-gif"
          onClick={clearSticker}
          title="点击取消"
        >
          <img src={stickerUrl} alt="sticker preview" />
          <span className="sticker-preview-x">×</span>
        </span>
      )}

      <input
        ref={inputRef}
        type="text"
        className="chat-input"
        placeholder="输入消息..."
        value={text}
        onChange={(e) => {
          textRef.current = e.target.value
          setText(e.target.value)
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.repeat) {
            e.preventDefault()
            handleSend()
          }
        }}
        disabled={disabled}
      />
      <button
        type="button"
        className="send-btn"
        onClick={handleSend}
        disabled={disabled || !canSend}
      >
        发送
      </button>
    </div>
  )
}

export default ChatInput
