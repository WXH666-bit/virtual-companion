import { useState, useEffect } from "react"
import { API } from "../App"
import "./SettingsModal.css"

interface ProviderPreset {
  name: string
  base_url: string
  default_model: string
  models: string[]
}

interface Props {
  onClose: () => void
  apiHeaders: () => Record<string, string>
}

function SettingsModal({ onClose, apiHeaders }: Props) {
  // ── Chat LLM config ──
  const [presets, setPresets] = useState<Record<string, ProviderPreset>>({})
  const [provider, setProvider] = useState("deepseek")
  const [apiKey, setApiKey] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [modelName, setModelName] = useState("")
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showKey, setShowKey] = useState(false)

  // ── Vision config ──
  const [visionEnabled, setVisionEnabled] = useState(false)
  const [visionNative, setVisionNative] = useState(false)
  const [visionProvider, setVisionProvider] = useState("siliconflow")
  const [visionModel, setVisionModel] = useState("")
  const [visionApiKey, setVisionApiKey] = useState("")
  const [visionBaseUrl, setVisionBaseUrl] = useState("")
  const [visionPresets, setVisionPresets] = useState<Record<string, ProviderPreset>>({})
  const [showVisionKey, setShowVisionKey] = useState(false)

  useEffect(() => {
    // Load main config first
    Promise.all([
      fetch(`${API}/api/providers/presets`, { headers: apiHeaders() }).then((r) => r.json()),
      fetch(`${API}/api/provider`, { headers: apiHeaders() }).then((r) => r.json()),
    ])
      .then(([presetsData, config]) => {
        setPresets(presetsData)

        const p = config.provider || "deepseek"
        setProvider(p)
        const preset = presetsData[p]
        setBaseUrl(config.base_url || preset?.base_url || "")
        setModelName(config.model_name || preset?.default_model || "")
        // Show the saved API key (or placeholder)
        const key = config.api_key || ""
        setApiKey(key && key !== "sk-placeholder" && !key.includes("sk-your") ? key : "")
        setLoading(false)
      })
      .catch(() => setLoading(false))

    // Load vision config independently
    Promise.all([
      fetch(`${API}/api/vision/providers`, { headers: apiHeaders() }).then((r) => r.json()),
      fetch(`${API}/api/vision/check`, { headers: apiHeaders() }).then((r) => r.json()),
    ])
      .then(async ([vPresets, visionCheck]) => {
        setVisionPresets(vPresets)
        setVisionEnabled(visionCheck.enabled)
        setVisionNative(visionCheck.native)

        // Load saved vision settings in a single call
        try {
          const vResp = await fetch(`${API}/api/vision/config`, { headers: apiHeaders() })
          const v = await vResp.json()
          const vp = v.vision_provider || "siliconflow"
          setVisionProvider(vp)
          setVisionModel(v.vision_model || vPresets[vp]?.default_model || "")
          setVisionApiKey(v.vision_api_key || "")
          setVisionBaseUrl(v.vision_base_url || vPresets[vp]?.base_url || "")
        } catch {
          setVisionProvider("siliconflow")
          const preset = vPresets["siliconflow"]
          if (preset) {
            setVisionModel(preset.default_model || "")
            setVisionBaseUrl(preset.base_url || "")
          }
        }
      })
      .catch(() => {
        // Vision API unavailable — use hardcoded fallback so dropdown has options
        setVisionPresets({
          siliconflow: {
            name: "硅基流动",
            base_url: "https://api.siliconflow.cn/v1",
            default_model: "Qwen/Qwen2.5-VL-32B-Instruct",
            models: [
              "Qwen/Qwen2.5-VL-32B-Instruct",
              "Qwen/Qwen2.5-VL-72B-Instruct",
              "Qwen/Qwen2.5-VL-7B-Instruct",
            ],
          },
          zhipu: {
            name: "智谱 GLM",
            base_url: "https://open.bigmodel.cn/api/paas/v4",
            default_model: "glm-4v-flash",
            models: ["glm-4v-flash", "glm-4v", "glm-4v-plus"],
          },
          qwen: {
            name: "通义千问",
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
            default_model: "qwen-vl-plus",
            models: ["qwen-vl-plus", "qwen-vl-max"],
          },
          openai: {
            name: "OpenAI",
            base_url: "https://api.openai.com/v1",
            default_model: "gpt-4o-mini",
            models: ["gpt-4o-mini", "gpt-4o"],
          },
        })
      })
  }, [])

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider)
    const preset = presets[newProvider]
    if (preset) {
      setBaseUrl(preset.base_url || "")
      setModelName(preset.default_model || "")
    }
  }

  const handleVisionProviderChange = (vp: string) => {
    setVisionProvider(vp)
    const preset = visionPresets[vp]
    if (preset) {
      setVisionBaseUrl(preset.base_url || "")
      setVisionModel(preset.default_model || "")
    }
  }

  const save = async () => {
    const hdr = apiHeaders()
    // Save chat LLM config
    await fetch(`${API}/api/provider`, {
      method: "PUT",
      headers: hdr,
      body: JSON.stringify({
        provider,
        api_key: apiKey.trim(),
        base_url: baseUrl.trim(),
        model_name: modelName.trim(),
      }),
    })

    // Save vision enabled toggle
    await fetch(`${API}/api/settings/vision_enabled`, {
      method: "PUT",
      headers: hdr,
      body: JSON.stringify({ value: visionEnabled ? "true" : "false" }),
    })

    // Save vision provider config (only if needed)
    if (visionEnabled && !visionNative) {
      await Promise.all([
        fetch(`${API}/api/settings/vision_provider`, {
          method: "PUT",
          headers: hdr,
          body: JSON.stringify({ value: visionProvider }),
        }),
        fetch(`${API}/api/settings/vision_model`, {
          method: "PUT",
          headers: hdr,
          body: JSON.stringify({ value: visionModel.trim() }),
        }),
        fetch(`${API}/api/settings/vision_api_key`, {
          method: "PUT",
          headers: hdr,
          body: JSON.stringify({ value: visionApiKey.trim() }),
        }),
        fetch(`${API}/api/settings/vision_base_url`, {
          method: "PUT",
          headers: hdr,
          body: JSON.stringify({ value: visionBaseUrl.trim() }),
        }),
      ])
    }

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const currentPreset = presets[provider]
  const models = currentPreset?.models || []
  const isCustomModel = models.length > 0 && !models.includes(modelName) && modelName !== ""

  const currentVisionPreset = visionPresets[visionProvider]
  const visionModels = currentVisionPreset?.models || []
  const isCustomVisionModel = visionModels.length > 0 && !visionModels.includes(visionModel) && visionModel !== ""

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ 模型设置</h3>

        {/* ── Provider selection ── */}
        <label className="setting-label">
          模型供应商
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value)}
            disabled={loading}
          >
            {Object.entries(presets).map(([id, p]) => (
              <option key={id} value={id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {/* Base URL */}
        <label className="setting-label">
          API 地址
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.xxx.com/v1"
            disabled={loading}
          />
        </label>
        {currentPreset?.base_url && baseUrl !== currentPreset.base_url && (
          <p className="setting-diff-hint">
            ⚡ 已修改（默认：{currentPreset.base_url}）
          </p>
        )}

        {/* Model name */}
        <label className="setting-label">
          模型名称
          {models.length > 0 ? (
            <div className="model-select-row">
              <select
                value={isCustomModel ? "__custom__" : modelName}
                onChange={(e) => {
                  if (e.target.value !== "__custom__") setModelName(e.target.value)
                }}
                disabled={loading}
              >
                {models.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                <option value="__custom__">自定义模型...</option>
              </select>
              {isCustomModel && (
                <input
                  type="text"
                  className="model-custom-input"
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  placeholder="输入模型名"
                  autoFocus
                />
              )}
            </div>
          ) : (
            <input
              type="text"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="model-name"
              disabled={loading}
            />
          )}
        </label>

        {/* API Key */}
        <label className="setting-label">
          API Key
          <div className="key-input-row">
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              disabled={loading}
            />
            <button
              className="btn-toggle-key"
              onClick={() => setShowKey(!showKey)}
              title={showKey ? "隐藏" : "显示"}
            >
              {showKey ? "🙈" : "👁️"}
            </button>
          </div>
        </label>
        <p className="setting-hint">
          密钥只会保存在你的本地，不会上传到任何地方
        </p>

        {/* ── Vision section ── */}
        <div className="settings-divider" />
        <h4>🖼️ 图片识别（可选）</h4>
        <p className="setting-hint">
          开启后角色能"看见"你发的动图表情包并据此回复
        </p>

        <label className="setting-toggle-label">
          <span>启用图片识别</span>
          <button
            type="button"
            className={`toggle-switch${visionEnabled ? " on" : ""}`}
            onClick={() => setVisionEnabled(!visionEnabled)}
          >
            <span className="toggle-knob" />
          </button>
        </label>

        {visionEnabled && visionNative && (
          <p className="setting-info">
            ✅ 当前模型 <strong>{modelName}</strong> 已支持视觉识别，无需额外配置
          </p>
        )}

        {visionEnabled && !visionNative && (
          <div className="vision-config-section">
            <p className="setting-info">
              ℹ️ 当前聊天模型不支持视觉，请单独配置视觉 API
            </p>

            {/* Vision provider */}
            <label className="setting-label">
              视觉供应商
              <select
                value={visionProvider}
                onChange={(e) => handleVisionProviderChange(e.target.value)}
                >
                {Object.entries(visionPresets).map(([id, p]) => (
                  <option key={id} value={id}>{p.name}</option>
                ))}
              </select>
            </label>

            {/* Vision base URL */}
            <label className="setting-label">
              视觉 API 地址
              <input
                type="text"
                value={visionBaseUrl}
                onChange={(e) => setVisionBaseUrl(e.target.value)}
                placeholder="https://api.xxx.com/v1"
              />
            </label>

            {/* Vision model */}
            <label className="setting-label">
              视觉模型
              {visionModels.length > 0 ? (
                <div className="model-select-row">
                  <select
                    value={isCustomVisionModel ? "__custom__" : visionModel}
                    onChange={(e) => {
                      if (e.target.value !== "__custom__") setVisionModel(e.target.value)
                    }}
                  >
                    {visionModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                    <option value="__custom__">自定义模型...</option>
                  </select>
                  {isCustomVisionModel && (
                    <input
                      type="text"
                      className="model-custom-input"
                      value={visionModel}
                      onChange={(e) => setVisionModel(e.target.value)}
                      placeholder="输入模型名"
                      autoFocus
                    />
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={visionModel}
                  onChange={(e) => setVisionModel(e.target.value)}
                  placeholder="model-name"
                />
              )}
            </label>

            {/* Vision API Key */}
            <label className="setting-label">
              视觉 API Key
              <div className="key-input-row">
                <input
                  type={showVisionKey ? "text" : "password"}
                  value={visionApiKey}
                  onChange={(e) => setVisionApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <button
                  className="btn-toggle-key"
                  onClick={() => setShowVisionKey(!showVisionKey)}
                  title={showVisionKey ? "隐藏" : "显示"}
                >
                  {showVisionKey ? "🙈" : "👁️"}
                </button>
              </div>
            </label>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="modal-actions">
          <button className="btn-save" onClick={save} disabled={loading}>
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
