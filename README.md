# 🐾 Virtual Companion — AI 虚拟伴侣

一个基于 Web 的 AI 聊天伴侣应用。支持注册登录，创建自定义 AI 角色（女友、死党、导师等），通过自然语言与它们进行实时对话。支持多种 LLM 供应商，AI 可自动搜索并发送 GIF 表情包，用户也能发送表情包（Emoji 内嵌文字 + GIF 动图），开启视觉识别后角色能"看见"图片内容（GIF 自动转 PNG 适配）。用户数据完全按账户隔离。

## ✨ 功能特性

- 🔐 **用户系统** — 注册/登录，JWT 认证，每个用户独立的数据和配置
- 🎭 **三种创建方式** — 选择已有角色 / 从模板创建（可修改人设）/ 自定义创建
- 🖼️ **角色头像** — 上传自定义头像，像微信一样用人名命名对话
- 👤 **个人主页** — 设置自己的名字和头像
- 💬 **实时流式对话** — SSE 流式输出，逐字显示，像真人在打字
- 😂 **表情包双向发送** — AI 自动搜 Gif 表情包，用户也能发（Emoji 内嵌文字 + GIF 动图搜索 + 默认推荐）
- 👁️ **视觉识别** — 开启后角色能"看见"用户发的 GIF 内容（GIF→PNG 自动转换，完全非阻塞）
- 🔌 **多模型支持** — DeepSeek / OpenAI / 智谱 / Kimi / 通义千问 / 硅基流动 / 自定义
- 📚 **对话管理** — 多对话并存，双键重命名、删除，对话自动以角色名命名
- 📝 **角色管理** — 改名、换头像、删除（预设角色受保护）
- 🔑 **设置面板** — 网页内配置 API Key、切换模型供应商、图片识别开关
- 🎨 **微信风格 UI** — 深色主题侧边栏 + 聊天气泡 + 头像 + Emoji 内嵌输入
- 🐍 **一键启动** — `python start.py` 同时启动前后端，自动打开浏览器
- 💾 **SQLite 存储** — 对话记录、表情包 URL、视觉识别结果、角色设置本地持久化

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Python FastAPI + Uvicorn |
| 数据库 | SQLite (SQLAlchemy ORM) |
| AI | 多供应商（OpenAI 兼容 SDK） |
| 表情包 | ChineseBQB 开源数据集 (5800+ GIF) + Emoji |
| 样式 | 纯 CSS（组件级样式文件） |

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (:5173)                     │
│  ┌──────────────────────────────────────────────────┐   │
│  │                  React 19 SPA                      │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │   │
│  │  │ Sidebar  │  │ChatWindow│  │ SkillEditor/   │   │   │
│  │  │对话列表   │  │ 消息流   │  │ Picker/Settings│   │   │
│  │  │用户入口   │  │ ChatInput│  │ ProfilePage    │   │   │
│  │  └──────────┘  └────┬─────┘  └───────────────┘   │   │
│  │                     │ SSE                          │   │
│  │              useChat hook (token/sticker/done)     │   │
│  └─────────────────────┼─────────────────────────────┘   │
└────────────────────────┼─────────────────────────────────┘
                         │ HTTP + SSE (text/event-stream)
┌────────────────────────┼─────────────────────────────────┐
│              FastAPI Server (:58000)                      │
│  ┌─────────────────────┼─────────────────────────────┐   │
│  │  routes/chat.py ──► POST /api/chat/send           │   │
│  │       │                 sticker 解析 + SSE 事件    │   │
│  │       ▼                                            │   │
│  │  services/                                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ │   │
│  │  │ memory.py│ │ skill.py │ │  llm.py  │ │sticker│ │   │
│  │  │滑动窗口  │ │角色加载  │ │多供应商  │ │.py    │ │   │
│  │  │上下文管理│ │Prompt构建│ │API 封装  │ │表情包 │ │   │
│  │  └──────────┘ └──────────┘ └─────┬────┘ └──────┘ │   │
│  │                         ┌──────────┐              │   │
│  │                         │vision.py │              │   │
│  │                         │图片识别  │              │   │
│  │       │            │               │              │   │
│  │  db/models.py ◄────┴───────────────┘              │   │
│  │  (SQLAlchemy ORM)                                 │   │
│  └───────────────────────────────────────────────────┘   │
│        SQLite (companion.db)     avatars/  .cache/       │
└──────────────────────────────────────────────────────────┘
                         │ HTTPS
                         ▼
             ┌─────────────────────┐
             │  多 LLM 供应商       │
             │  DeepSeek / OpenAI / │
             │  智谱 / Kimi / Qwen │
             │  / SiliconFlow ...  │
             └─────────────────────┘
```

### 数据流

```
用户输入（文字 + 可选 Emoji/GIF）
  → fetch POST /api/chat/send (JSON body: content + sticker_url, Authorization header)
    → chat.py 接收，保存用户消息（含 sticker 字段）
    → 如果有 sticker_url + 视觉识别开启 → daemon 线程异步运行 vision.py
      → 检测 GIF → 下载 → Pillow 提取首帧 → PNG base64 → 调视觉 API
      → 结果写入 messages.img_desc（下轮对话可用）
    → memory.py 取最近 N 轮对话（含 sticker 使用痕迹 + img_desc 图片描述）
    → skill.py 构建 system prompt（角色人设 + 表情包指令 + sticker_examples）
    → llm.py 调用 LLM API（stream=True，按 user_id 解析配置）
    ← SSE 流式返回 token（立即开始，0 延迟）
    → AI 回复完成后解析 [STICKER:xxx] 标记
    → sticker.py 搜索 GIF 表情包（ChineseBQB → Emoji 兜底，URL 自动 CDN 重写）
    ← SSE sticker 事件
    → 消息持久化到 SQLite（含 sticker_url / sticker_emoji / img_desc）
  → useChat hook 逐 token 更新 + sticker 渲染
```

### 前端组件树

```
App
├── AuthPage (登录/注册，未认证时显示)
├── Sidebar
│   ├── 用户入口 → ProfilePage
│   ├── 对话列表 (conversations.map，以角色名命名)
│   ├── + 新建对话 → NewChatPicker (选择/模板/自定义)
│   └── 🎭 角色管理 → SkillEditor (删除/改名/头像)
├── ChatWindow
│   ├── 聊天头部（角色头像 + 名字）
│   ├── ChatBubble[] (消息列表 + 表情包)
│   └── ChatInput (输入框 + 表情按钮 + GIF 预览 + 发送)
│       └── StickerPicker (Emoji 分类网格 + GIF 搜索双 Tab + 推荐)
├── NewChatPicker (三种方式开始对话)
├── SkillEditor (角色管理：删除/重命名/头像 + AI 优化)
├── SettingsModal (模型供应商/API Key + 图片识别配置)
└── ProfilePage (个人主页：用户名 + 头像)
```

### 后端服务分层

| 层 | 文件 | 职责 |
|----|------|------|
| Router | `routes/chat.py` | SSE 流式聊天、sticker 标记解析 |
| Router | `routes/skills.py` | 对话/角色/设置/头像/供应商/用户资料 CRUD |
| Service | `services/llm.py` | 多供应商 LLM 调用、Key/配置解析 |
| Service | `services/skill.py` | 角色加载、system prompt 构建（含表情包指令） |
| Service | `services/memory.py` | 滑动窗口上下文截断 |
| Service | `services/sticker.py` | ChineseBQB 搜索 + Emoji 映射 + CDN 重写 + 多源索引 |
| Service | `services/vision.py` | 视觉识别，多供应商支持，异步非阻塞 |
| DB | `db/database.py`, `db/models.py` | SQLAlchemy 连接、ORM 模型 |

## 📁 目录结构

```
virtual-companion/
├── client/                    # React 前端
│   ├── src/
│   │   ├── App.tsx            # 根组件，状态管理 & API 调用
│   │   ├── components/        # UI 组件
│   │   │   ├── Sidebar.tsx    # 侧边栏：用户入口 + 对话列表
│   │   │   ├── ChatWindow.tsx # 主聊天区
│   │   │   ├── ChatBubble.tsx # 聊天气泡（微信风格，支持表情包）
│   │   │   ├── ChatInput.tsx  # 底部输入栏（防重复发送）
│   │   │   ├── NewChatPicker.tsx  # 新建对话（选择/模板/自定义）
│   │   │   ├── SkillEditor.tsx    # 角色管理（删除/重命名/头像）
│   │   │   ├── ProfilePage.tsx    # 个人主页（用户名 + 头像）
│   │   │   ├── SettingsModal.tsx  # 设置面板（供应商/模型/Key + 图片识别）
│   │   │   ├── StickerPicker.tsx  # 表情选择器（Emoji 网格 + GIF 搜索）
│   │   │   ├── StickerPicker.css
│   │   │   └── *.css
│   │   └── hooks/useChat.ts  # 核心 Hook：SSE 流式 + sticker 处理
│   └── vite.config.ts
├── server/                    # Python 后端
│   ├── main.py                # FastAPI 入口 + CORS + 自动建表 + 预加载
│   ├── avatars/               # 头像图片存储
│   ├── routes/
│   │   ├── chat.py            # SSE 流式聊天 + sticker 解析
│   │   └── skills.py          # 对话/角色/设置/头像/供应商/用户资料
│   ├── services/
│   │   ├── llm.py             # 多供应商 LLM 封装（7 个预设 + 自定义）
│   │   ├── skill.py           # 角色加载 & system prompt 构建
│   │   ├── memory.py          # 滑动窗口上下文管理
│   │   ├── sticker.py         # ChineseBQB 搜索 + Emoji 映射 + CDN 重写
│   │   └── vision.py          # 视觉识别（异步非阻塞）
│   ├── data/
│   │   └── chinesebqb.json    # 内置表情包索引（5810 条，兜底）
│   ├── db/
│   │   ├── database.py        # SQLAlchemy 连接
│   │   └── models.py          # 数据模型
│   └── requirements.txt
├── skills/                    # 角色定义 JSON
│   ├── girlfriend.json        # 预设：小雨（女友）
│   ├── bestie.json            # 预设：阿杰（死党）
│   └── mentor.json            # 预设：林老师（导师）
├── start.py                   # 一键启动脚本
└── .gitignore
```

## 🚀 快速开始

### 环境要求

- **Python** >= 3.10
- **Node.js** >= 18
- **LLM API Key**（支持 DeepSeek / OpenAI / 智谱 / Kimi / Qwen / 硅基流动 等）

### 1. 克隆项目

```bash
git clone https://github.com/WXH666-bit/virtual-companion.git
cd virtual-companion
```

### 2. 安装依赖 & 启动

```bash
python start.py
```

启动脚本会自动：
- 检查并安装 Python 依赖（FastAPI, SQLAlchemy, OpenAI SDK...）
- 检查并安装 Node 依赖（React, Vite...）
- 释放 58000 / 5173 端口占用
- 启动后端 → `http://localhost:58000`
- 启动前端 → `http://localhost:5173`
- 自动打开浏览器

### 3. 配置 API Key

打开浏览器后，点击侧边栏 **⚙️ 设置**：
1. 选择模型供应商（DeepSeek / OpenAI / 智谱 / Kimi ...）
2. 输入你的 API Key
3. 可选：自定义 API 地址和模型名称
4. 保存

> 所有配置存储在本地 SQLite 数据库中，不会上传到任何地方。

### 4. 开始聊天

点击 **+ 新建对话**，选择一个角色（或创建你自己的角色），开始聊天！

AI 在表达情绪时会自动发送表情包动图，你也可以直接说「给我发个开心的表情包」。

## 🎭 Skill 角色系统

每个角色是一个 `skills/*.json` 文件。支持两种模式：

### 自由描述模式（推荐）

```json
{
  "name": "小鹿",
  "relationship": "恋人",
  "description": "恋人 · 长描述模式",
  "raw_prompt": "她叫小鹿，是我大学同学。她性格温柔又傲娇..."
}
```

`raw_prompt` 存在时，直接作为 system prompt 注入，自由度最高。

### 结构化模式

```json
{
  "name": "小雨",
  "personality": "温柔体贴，偶尔撒娇...",
  "backstory": "大学学妹，学文学的...",
  "speaking_style": "喜欢用'呀''啦'等语气词...",
  "example_dialogue": [
    {"user": "我今天好累", "reply": "怎么啦 又加班了吗😔 记得吃饭呀"}
  ]
}
```

通过模板自动拼接生成 system prompt。

### 角色创建与管理

**创建角色（点击 ＋ 按钮）：**
- **选择已有角色**：从已有角色中选一个直接开始聊天
- **从模板创建**：选择预设模板（小雨/阿杰/林老师），可修改人设、名字和头像后创建
- **自定义创建**：从零开始，填写名字、关系、人设描述、可选头像

**管理角色（侧边栏底部 🎭 角色管理）：**
- **重命名角色**：内联编辑，自动同步更新文件名、头像和对话引用
- **角色头像**：独立上传按钮，支持 PNG/JPG/GIF/WebP
- **删除角色**：自定义角色可删除，内置预设角色受保护

**对话命名**：新建对话自动以角色名命名（如"小雨"、"阿杰"），不再显示"新的对话"。

## 🔌 多模型供应商

内置 7 个供应商预设 + 自定义模式：

| 供应商 | 默认模型 | API 地址 |
|--------|----------|----------|
| DeepSeek | `deepseek-chat` | `https://api.deepseek.com` |
| OpenAI | `gpt-4o` | `https://api.openai.com/v1` |
| 智谱 GLM | `glm-4-flash` | `https://open.bigmodel.cn/api/paas/v4` |
| 月之暗面 Kimi | `moonshot-v1-8k` | `https://api.moonshot.cn/v1` |
| 通义千问 | `qwen-turbo` | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| 硅基流动 | `deepseek-ai/DeepSeek-V3` | `https://api.siliconflow.cn/v1` |
| 自定义 | 手动输入 | 手动输入 |

所有供应商使用 OpenAI 兼容接口，配置存储在 SQLite `settings` 表中。切换供应商时自动填充默认 API 地址和模型，也可手动覆盖。

## 😂 表情包系统

### AI 发

AI 在回复中以 `[STICKER: 关键词]` 格式标记表情包，后端自动搜索匹配：
- **动图来源**：ChineseBQB 开源数据集（5800+ GIF），URL 自动重写为 jsDelivr CDN（国内可访问）
- **多源索引**：jsDelivr CDN → GitHub Raw → 本地 .cache（24h）→ 内置 data/ 兜底
- **Emoji 兜底**：无匹配时回退到 50+ 关键词 Emoji 映射表
- **示例引导**：角色的 `sticker_examples` 字段会被注入 system prompt

### 用户发

- **Emoji**：😊 按钮 → Emoji Tab（47 分类）→ 选中后内嵌到输入框光标位置（微信风格）
- **GIF 动图**：😊 按钮 → 动图 Tab → 搜索关键词 → 缩略图列表中选取 → 输入框左侧预览
- **视觉识别**（可选）：开启后角色能"看见"用户发的 GIF 内容并针对性回复

## 📡 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册新用户（返回 JWT） |
| POST | `/api/auth/login` | 登录（返回 JWT） |
| GET | `/api/auth/me` | 获取当前用户信息 |
| GET | `/api/skills` | 列出所有角色（含头像 URL） |
| GET | `/api/skills/{id}` | 获取角色详情 |
| POST | `/api/skills/upload` | 上传/创建角色（JSON 或 TXT） |
| PUT | `/api/skills/{id}/rename` | 重命名角色 |
| DELETE | `/api/skills/{id}` | 删除角色（预设保护） |
| POST | `/api/skills/{id}/avatar` | 上传角色头像 |
| DELETE | `/api/skills/{id}/avatar` | 删除角色头像 |
| DELETE | `/api/skills/{id}/clear-context` | 清空该角色所有对话历史 |
| GET | `/api/conversations` | 列出当前用户的对话 |
| POST | `/api/conversations` | 创建新对话 |
| DELETE | `/api/conversations/{id}` | 删除对话 |
| PUT | `/api/conversations/{id}/rename` | 重命名对话 |
| PUT | `/api/conversations/{id}/skill` | 切换对话角色 |
| GET | `/api/conversations/{id}/messages` | 获取历史消息（含 sticker + img_desc） |
| POST | `/api/chat/send` | 发送消息（SSE 流式，后台视觉识别） |
| PUT | `/api/settings/{key}` | 保存当前用户的设置 |
| GET | `/api/settings/{key}` | 读取当前用户的设置 |
| GET | `/api/providers/presets` | 获取供应商预设 |
| GET | `/api/provider` | 获取当前用户的模型配置 |
| PUT | `/api/provider` | 保存当前用户的模型配置 |
| GET | `/api/profile` | 获取用户资料 |
| PUT | `/api/profile` | 更新用户名字 |
| POST | `/api/profile/avatar` | 上传用户头像 |
| DELETE | `/api/profile/avatar` | 删除用户头像 |
| GET | `/api/stickers/emoji` | 获取 Emoji 分类（前端选择器用） |
| GET | `/api/stickers/search?q=xx` | 搜索 ChineseBQB GIF 表情包 |
| GET | `/api/stickers/popular` | 获取推荐 GIF 表情包 |
| GET | `/api/vision/providers` | 获取视觉模型供应商预设 |
| GET | `/api/vision/check` | 检查聊天模型是否支持视觉 |
| GET | `/api/vision/config` | 获取视觉配置（合并查询） |

**SSE 聊天事件**（`POST /api/chat/send`）：

| 事件 | 说明 |
|------|------|
| `token` | 逐 token 流式文本 |
| `clean_text` | 移除标记后的干净文本 |
| `sticker` | 表情包（GIF URL 或 Emoji） |
| `done` | 流结束 |
| `error` | 错误信息 |

## 🗄️ 数据库

SQLite 数据库自动创建于 `server/companion.db`，包含四张表：

- **users** — id, username (唯一), password_hash (bcrypt), created_at
- **conversations** — id, user_id (FK), title, skill_name, created_at, updated_at
- **messages** — id, conversation_id, role, content, sticker_url, sticker_emoji, img_desc, created_at
- **settings** — id (主键), key, value, user_id (FK), UNIQUE(key, user_id)

每个用户的对话、设置、配置完全隔离。启动时自动执行建表 + 迁移（settings 表重建支持多用户，messages 表添加 img_desc 等列）。

## 🔮 后续优化

> 打勾 = 已完成

### 体验增强
- [ ] **Markdown 渲染** — 支持 AI 回复中的代码块、列表、加粗等富文本渲染
- [ ] **消息操作** — 复制、重新生成、编辑已发送消息
- [ ] **暗色/亮色主题切换** — 目前仅深色主题，增加亮色模式
- [ ] **移动端适配** — 响应式布局，支持手机浏览器
- [ ] **打字机音效 / 头像动画** — 增加沉浸感

### 对话能力
- [ ] **对话分支** — 从任意消息分叉出新对话线
- [ ] **对话搜索** — 全文搜索历史对话
- [ ] **对话导出** — 导出为 Markdown / JSON / 图片
- [ ] **上下文长度可配置** — 允许用户调整滑动窗口大小

### 角色系统
- [x] **角色头像** — 支持上传角色头像，对话以角色名命名
- [x] **模板角色创建** — 从预设模板创建角色，可修改人设和名字
- [ ] **角色市场** — 分享/导入社区角色模板
- [ ] **多角色群聊** — 一个对话中多个 AI 角色互动
- [ ] **角色语音** — TTS 语音合成，让角色"说话"

### 工程优化
- [ ] **Docker 部署** — 一键容器化部署
- [ ] **数据库迁移工具** — Alembic 管理 schema 变更
- [ ] **前端状态管理** — 引入 Zustand/Jotai 替代 useState 传递
- [ ] **API 测试覆盖** — pytest + httpx 后端接口测试
- [ ] **前端组件测试** — Vitest + React Testing Library
- [ ] **日志系统** — 结构化日志 + 请求追踪 ID
- [ ] **错误监控** — Sentry 或自建错误收集

### 用户系统
- [x] **注册登录** — JWT 认证，每用户独立数据隔离
- [x] **用户头像与昵称** — 个人主页管理
- [x] **清空对话上下文** — 角色管理中可清除指定角色的所有对话历史

### AI 能力
- [x] **多模型支持** — 已支持 DeepSeek / OpenAI / 智谱 / Kimi / Qwen / SiliconFlow / 自定义
- [x] **表情包搜索** — AI 根据对话情绪自动搜索并发送 GIF 动图
- [x] **用户表情包** — 用户可发送 Emoji（内嵌文字）+ GIF 动图（搜索 + 默认推荐）
- [x] **视觉识别** — 角色能"看见"用户发的表情包内容（GIF→PNG 转换，完全非阻塞）
- [ ] **工具调用 (Function Calling)** — AI 可调用外部工具（天气、搜索等）
- [ ] **长期记忆** — 跨对话记忆用户偏好、重要信息
- [ ] **RAG 知识库** — 角色可引用外部知识文档

## 📄 License

MIT

---

<p align="center">Made with ❤️ by <a href="https://github.com/WXH666-bit">Weixhne</a></p>
