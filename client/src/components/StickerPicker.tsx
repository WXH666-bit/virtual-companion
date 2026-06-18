import { useState, useEffect } from "react"
import { API } from "../App"
import "./StickerPicker.css"

interface EmojiCategory {
  key: string
  emojis: string[]
}

interface Props {
  onSelectEmoji: (emoji: string) => void
  onSelectGif: (url: string) => void
  onClose: () => void
}

function StickerPicker({ onSelectEmoji, onSelectGif, onClose }: Props) {
  const [tab, setTab] = useState<"emoji" | "gif">("emoji")
  const [categories, setCategories] = useState<EmojiCategory[]>([])
  const [gifKeyword, setGifKeyword] = useState("")
  const [gifResults, setGifResults] = useState<string[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Load emoji categories
  useEffect(() => {
    fetch(`${API}/api/stickers/emoji`)
      .then((r) => r.json())
      .then((data) => setCategories(data.categories || []))
      .catch(() => {
        setCategories([
          { key: "开心", emojis: ["😄"] },
          { key: "大笑", emojis: ["😂"] },
          { key: "害羞", emojis: ["😳"] },
          { key: "难过", emojis: ["😢"] },
          { key: "生气", emojis: ["😠"] },
          { key: "撒娇", emojis: ["🥺"] },
        ])
      })
  }, [])

  // Load popular GIFs when switching to GIF tab and no search yet
  useEffect(() => {
    if (tab === "gif" && !hasSearched && gifResults.length === 0) {
      setGifLoading(true)
      fetch(`${API}/api/stickers/popular`)
        .then((r) => r.json())
        .then((data) => {
          setGifResults(data.results || [])
          setGifLoading(false)
        })
        .catch(() => setGifLoading(false))
    }
  }, [tab])

  const searchGif = () => {
    if (!gifKeyword.trim()) return
    setGifLoading(true)
    setHasSearched(true)
    fetch(`${API}/api/stickers/search?q=${encodeURIComponent(gifKeyword.trim())}`)
      .then((r) => r.json())
      .then((data) => setGifResults(data.results || []))
      .finally(() => setGifLoading(false))
  }

  return (
    <div className="sticker-picker">
      <div className="sticker-picker-tabs">
        <button
          type="button"
          className={tab === "emoji" ? "active" : ""}
          onClick={() => setTab("emoji")}
        >
          Emoji
        </button>
        <button
          type="button"
          className={tab === "gif" ? "active" : ""}
          onClick={() => setTab("gif")}
        >
          动图
        </button>
        <button type="button" className="sticker-picker-close" onClick={onClose}>
          ✕
        </button>
      </div>

      {tab === "emoji" && (
        <div className="sticker-emoji-grid">
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              className="sticker-emoji-btn"
              title={cat.key}
              onClick={() => onSelectEmoji(cat.emojis[0])}
            >
              {cat.emojis[0]}
            </button>
          ))}
        </div>
      )}

      {tab === "gif" && (
        <div className="sticker-gif-tab">
          <div className="sticker-gif-search">
            <input
              type="text"
              value={gifKeyword}
              onChange={(e) => {
                setGifKeyword(e.target.value)
                if (!e.target.value) setHasSearched(false)
              }}
              onKeyDown={(e) => e.key === "Enter" && searchGif()}
              placeholder={hasSearched ? "搜索动图关键词..." : "搜索动图，或浏览下方推荐"}
            />
            <button
              type="button"
              onClick={searchGif}
              disabled={!gifKeyword.trim() || gifLoading}
            >
              搜索
            </button>
          </div>
          <div className="sticker-gif-grid">
            {gifLoading && <div className="sticker-gif-loading">加载中...</div>}
            {!gifLoading && gifResults.length === 0 && (
              <div className="sticker-gif-empty">没有找到相关动图，换个词试试</div>
            )}
            {gifResults.map((url) => (
              <button
                key={url}
                type="button"
                className="sticker-gif-btn"
                onClick={() => onSelectGif(url)}
              >
                <img src={url} alt="sticker" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default StickerPicker
