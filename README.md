# 🐾 Virtual Companion — AI 虚拟伴侣

一个基于 Web 的 AI 聊天伴侣应用。你可以创建自定义 AI 角色（女友、死党、导师等），通过自然语言与它们进行实时对话。角色身份由 **Skill** 定义，支持结构化 JSON 模板和自由长文本描述两种模式。AI 后端对接 **DeepSeek API**，支持流式 SSE 输出。

## ✨ 功能特性

- 🎭 **自定义角色** — 创建任意性格的 AI 角色：恋人、朋友、导师、偶像...
- 📝 **双模式角色定义** — 结构化模板（性格/背景/说话风格）或自由长文本描述（raw_prompt）
- 💬 **实时流式对话** — SSE 流式输出，逐字显示，像真人在打字
- 📚 **对话管理** — 多对话并存，随时切换角色、重命名、删除
- 🔑 **API Key 面板** — 网页内 Settings 面板配置 DeepSeek API Key
- 🎨 **微信风格 UI** — 深色主题侧边栏 + 聊天气泡，颜值在线
- 🐍 **一键启动** — `python start.py` 同时启动前后端，自动打开浏览器
- 💾 **SQLite 存储** — 对话记录、角色设置本地持久化，开箱即用

## 🛠️ 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Python FastAPI + Uvicorn |
| 数据库 | SQLite (SQLAlchemy ORM) |
| AI | DeepSeek API (`deepseek-chat`) |
| 样式 | 纯 CSS（组件级样式文件） |

## 📁 目录结构

```
virtual-companion/
├── client/                    # React 前端
│   ├── src/
│   │   ├── App.tsx            # 根组件，状态管理 & API 调用
│   │   ├── components/        # UI 组件
│   │   │   ├── Sidebar.tsx    # 侧边栏：对话列表
│   │   │   ├── ChatWindow.tsx # 主聊天区
│   │   │   ├── ChatBubble.tsx # 聊天气泡（微信风格）
│   │   │   ├── ChatInput.tsx  # 底部输入栏
│   │   │   ├── SkillPicker.tsx    # 选择角色
│   │   │   ├── SkillEditor.tsx    # 角色编辑器
│   │   │   ├── ProfilePage.tsx    # 角色详情页
│   │   │   └── SettingsModal.tsx  # 设置面板（API Key）
│   │   └── hooks/useChat.ts  # 核心 Hook：SSE 流式接收
│   └── vite.config.ts
├── server/                    # Python 后端
│   ├── main.py                # FastAPI 入口 + CORS + 自动建表
│   ├── routes/
│   │   ├── chat.py            # POST /api/chat/send — SSE 流
│   │   └── skills.py          # 对话 CRUD + 角色管理 + 设置
│   ├── services/
│   │   ├── llm.py             # DeepSeek API 封装
│   │   ├── skill.py           # 角色加载 & system prompt 构建
│   │   └── memory.py          # 滑动窗口上下文管理
│   ├── db/
│   │   ├── database.py        # SQLAlchemy 连接
│   │   └── models.py          # 数据模型
│   └── requirements.txt
├── skills/                    # 角色定义 JSON
│   ├── girlfriend.json        # 预设：小雨（女友）
│   ├── bestie.json            # 预设：阿杰（死党）
│   └── mentor.json            # 预设：林老师（导师）
└── start.py                   # 一键启动脚本
```

## 🚀 快速开始

### 环境要求

- **Python** >= 3.10
- **Node.js** >= 18
- **DeepSeek API Key**（[获取地址](https://platform.deepseek.com/)）

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

打开浏览器后，点击侧边栏 **⚙️ 设置**，输入你的 DeepSeek API Key。

> API Key 存储在本地 SQLite 数据库中，不会上传到任何地方。

### 4. 开始聊天

点击 **+ 新建对话**，选择一个角色（或创建你自己的角色），开始聊天！

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

### 预设角色保护

`girlfriend.json`、`bestie.json`、`mentor.json` 为预设角色，前端无法直接删除（API 返回 403）。用户自建角色不受限制。

## 📡 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 列出所有角色 |
| GET | `/api/skills/{id}` | 获取角色详情 |
| POST | `/api/skills/upload` | 上传/创建角色 |
| DELETE | `/api/skills/{id}` | 删除角色（预设保护） |
| GET | `/api/conversations` | 列出所有对话 |
| POST | `/api/conversations` | 创建新对话 |
| DELETE | `/api/conversations/{id}` | 删除对话 |
| PUT | `/api/conversations/{id}/rename` | 重命名对话 |
| PUT | `/api/conversations/{id}/skill` | 切换对话角色 |
| GET | `/api/conversations/{id}/messages` | 获取历史消息 |
| POST | `/api/chat/send` | 发送消息（SSE 流式） |
| PUT | `/api/settings/{key}` | 保存设置 |
| GET | `/api/settings/{key}` | 读取设置 |

## 🗄️ 数据库

SQLite 数据库自动创建于 `server/companion.db`，包含三张表：

- **conversations** — 对话 ID、标题、角色名、创建/更新时间
- **messages** — 消息 ID、对话 ID、角色(user/assistant)、内容、时间戳
- **settings** — 键值对存储（API Key 等）

## 📄 License

MIT

---

<p align="center">Made with ❤️ by <a href="https://github.com/WXH666-bit">Weixhne</a></p>
