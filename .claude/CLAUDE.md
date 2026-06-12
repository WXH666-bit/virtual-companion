# Virtual Companion — 项目文档

## 概述

一个 Web 聊天伴侣应用，用户可以创建自定义 AI 角色（女友、死党、导师等）并与之对话。角色身份由 Skill 定义（结构化 JSON 或长文本自由描述），AI 后端对接 DeepSeek API。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Python FastAPI + Uvicorn |
| 数据库 | SQLite (文件: `server/companion.db`) |
| AI | DeepSeek API (`deepseek-chat`) |

## 目录结构

```
virtual-companion/
├── client/                    # React 前端
│   ├── src/
│   │   ├── App.tsx            # 根组件，状态管理，API 调用
│   │   ├── components/
│   │   │   ├── Sidebar.tsx    # 侧边栏：对话列表、新建对话
│   │   │   ├── Sidebar.css    # 深色主题侧边栏样式
│   │   │   ├── ChatWindow.tsx # 主聊天区：消息列表 + 输入框
│   │   │   ├── ChatBubble.tsx # 聊天气泡（微信风格）
│   │   │   ├── ChatInput.tsx  # 底部输入栏
│   │   │   ├── SkillPicker.tsx # 新建对话时选择角色
│   │   │   ├── SkillEditor.tsx # 角色管理：长文本/JSON 创建 + 导入
│   │   │   ├── SettingsModal.tsx # 设置面板：配置 API Key
│   │   │   └── *.css          # 各组件样式
│   │   ├── hooks/
│   │   │   └── useChat.ts     # 核心聊天 hook：SSE 流式接收
│   │   └── main.tsx           # React 入口
│   └── vite.config.ts
├── server/                    # Python 后端
│   ├── main.py                # FastAPI 入口，CORS，自动建表
│   ├── routes/
│   │   ├── chat.py            # POST /api/chat/send — SSE 流式聊天
│   │   └── skills.py          # 对话 CRUD + 技能管理 + 设置 API
│   ├── services/
│   │   ├── llm.py             # DeepSeek API 封装（支持动态 Key）
│   │   ├── skill.py           # 技能加载、system prompt 构建
│   │   └── memory.py          # 滑动窗口上下文管理
│   ├── db/
│   │   ├── database.py        # SQLite 连接（SQLAlchemy）
│   │   └── models.py          # 数据模型
│   └── requirements.txt
├── skills/                    # 角色定义 JSON 文件
│   ├── girlfriend.json        # 预设：小雨（结构化模板）
│   ├── bestie.json            # 预设：阿杰（结构化模板）
│   └── mentor.json            # 预设：林老师（结构化模板）
├── start.py                   # 一键启动脚本
└── .gitignore                 # 忽略 .env *.db node_modules/
```

## 启动方式

```bash
python start.py
```

会同时启动：
- 后端 uvicorn → `http://localhost:58000`
- 前端 vite → `http://localhost:5173`

启动后自动打开浏览器。

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 列出所有角色 |
| GET | `/api/skills/{id}` | 获取角色详情 |
| POST | `/api/skills/upload` | 上传/创建角色 JSON |
| DELETE | `/api/skills/{id}` | 删除自定义角色（预设保护） |
| GET | `/api/conversations` | 列出所有对话 |
| POST | `/api/conversations` | 创建新对话 |
| DELETE | `/api/conversations/{id}` | 删除对话 |
| PUT | `/api/conversations/{id}/rename` | 重命名对话 |
| PUT | `/api/conversations/{id}/skill` | 切换对话角色 |
| GET | `/api/conversations/{id}/messages` | 获取对话消息 |
| POST | `/api/chat/send` | 发送消息（SSE 流式返回） |
| PUT | `/api/settings/{key}` | 保存设置（如 api_key） |
| GET | `/api/settings/{key}` | 读取设置 |

## 数据库模型

三张表（SQLite，文件 `server/companion.db`）：

- **conversations** — id, title, skill_name, created_at, updated_at
- **messages** — id, conversation_id, role(user/assistant), content, created_at
- **settings** — key (主键), value (用于存储 api_key 等)

`.gitignore` 已忽略 `*.db`，不会上传。

## Skill 系统

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
`raw_prompt` 存在时，直接作为 system prompt 注入，只追加最少的规则约束。

### 结构化模式
```json
{
  "name": "小雨",
  "personality": "温柔体贴...",
  "backstory": "大学学妹...",
  "speaking_style": "喜欢用'呀''啦'...",
  "example_dialogue": [...]
}
```
通过 `build_system_prompt()` 模板拼接。

预设角色（girlfriend/bestie/mentor）受保护，DELETE API 会返回 403。

## API Key 管理

用户通过网页 Settings 面板输入 Key，存储在 `settings` 表中。`services/llm.py` 的 `_resolve_api_key()` 查找顺序：
1. 数据库 `settings` 表
2. `.env` 文件（可选，已不推荐）
3. 占位符 `sk-placeholder`

如果 Key 未配置，聊天时返回友好错误提示。

## 关键注意事项

- **Windows 编码**：终端输出中文可能乱码，不影响功能
- **npm.cmd**：Windows 上 npm 是 `.cmd` 文件，`start.py` 的 `find_npm()` 已处理
- **端口**：后端 58000，前端 5173，`start.py` 启动前自动释放占用
- **CORS**：`main.py` 允许 `localhost:5173` 跨域
- **流式输出**：`chat.py` 返回 SSE (`text/event-stream`)，前端 `useChat.ts` 逐 token 渲染
- **数据库自动创建**：`main.py` 启动时 `create_all()` 自动建表，clone 后开箱即用
