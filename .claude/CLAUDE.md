# Virtual Companion — 项目文档

## 概述

一个 Web 聊天伴侣应用，用户可以注册登录、创建自定义 AI 角色（女友、死党、导师等）并与之对话。角色身份由 Skill 定义（结构化 JSON 或长文本自由描述），AI 后端支持多种 LLM 供应商（DeepSeek / OpenAI / 智谱 / 月之暗面 / 通义千问 / 硅基流动 / 自定义），支持表情包搜索与发送，用户也可发送表情包（Emoji 内嵌文字 + GIF 动图），支持视觉识别让角色"看见"图片内容（GIF 自动转 PNG 适配）。用户数据按账户隔离，JWT 认证。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite |
| 后端 | Python FastAPI + Uvicorn |
| 数据库 | SQLite (文件: `server/companion.db`) |
| AI | 多供应商兼容 OpenAI SDK（DeepSeek、OpenAI、智谱、Kimi、Qwen、SiliconFlow、自定义） |
| 表情包 | ChineseBQB 开源数据集 (5800+) + Emoji 兜底 |

## 目录结构

```
virtual-companion/
├── client/                    # React 前端
│   ├── src/
│   │   ├── App.tsx            # 根组件，状态管理，API 调用
│   │   ├── components/
│   │   │   ├── Sidebar.tsx    # 侧边栏：对话列表、用户入口、新建对话
│   │   │   ├── Sidebar.css    # 深色主题侧边栏样式
│   │   │   ├── ChatWindow.tsx # 主聊天区：消息列表 + 输入框
│   │   │   ├── ChatBubble.tsx # 聊天气泡（微信风格），支持表情包渲染
│   │   │   ├── ChatInput.tsx  # 底部输入栏（防重复发送锁）
│   │   │   ├── NewChatPicker.tsx # 新建对话：选择角色/模板创建/自定义创建
│   │   │   ├── SkillEditor.tsx # 角色管理：删除/重命名/头像/清空上下文
│   │   │   ├── ProfilePage.tsx # 个人主页：用户名与头像管理
│   │   │   ├── SettingsModal.tsx # 设置面板：多供应商模型配置 + 图片识别
│   │   │   ├── AuthPage.tsx     # 登录/注册页面
│   │   │   ├── StickerPicker.tsx # 表情包选择器：Emoji 分类 + GIF 搜索（双 Tab）+ 推荐
│   │   │   ├── StickerPicker.css # 弹出面板样式
│   │   │   └── *.css          # 各组件样式
│   │   ├── hooks/
│   │   │   └── useChat.ts     # 核心聊天 hook：SSE 流式接收 + sticker 处理
│   │   └── main.tsx           # React 入口
│   └── vite.config.ts
├── server/                    # Python 后端
│   ├── main.py                # FastAPI 入口，CORS，自动建表，DB 迁移，表情包预加载
│   ├── avatars/               # 角色/用户头像图片存储
│   ├── routes/
│   │   ├── chat.py            # POST /api/chat/send — SSE 流式聊天 + sticker 解析 + 后台视觉
│   │   ├── skills.py          # 对话 CRUD + 角色管理 + 设置(按用户) + 头像 + 供应商配置 + 用户资料
│   │   └── auth.py            # POST /api/auth/register & login — JWT 注册/登录
│   ├── services/
│   │   ├── llm.py             # 多供应商 LLM 封装（7 个预设 + 自定义，按 user_id 过滤配置）
│   │   ├── skill.py           # 角色加载、system prompt 构建（含表情包指令）
│   │   ├── memory.py          # 滑动窗口上下文管理（贴纸事件汇总为独立 system 消息）
│   │   ├── sticker.py         # 表情包搜索（ChineseBQB 5800+ GIF + Emoji 映射表 + CDN 重写）
│   │   ├── vision.py          # 视觉识别（GIF→PNG 帧提取，后台线程，完全非阻塞）
│   │   └── auth.py            # JWT 生成/验证 + bcrypt 密码哈希
│   ├── db/
│   │   ├── database.py        # SQLite 连接（SQLAlchemy）
│   │   └── models.py          # 数据模型（含 sticker_url/sticker_emoji）
│   ├── data/
│   │   └── chinesebqb.json    # 内置表情包索引（5810 条，网络不可用时兜底）
│   └── requirements.txt
├── skills/                    # 角色定义 JSON 文件
│   ├── girlfriend.json        # 预设：小雨（结构化模板）
│   ├── bestie.json            # 预设：阿杰（结构化模板）
│   ├── mentor.json            # 预设：林老师（结构化模板）
│   ├── 沈知夏.json            # 自定义：傲娇青梅竹马（含 sticker_examples）
│   └── 阿杰.json              # 自定义：死党（自由描述模式）
├── start.py                   # 一键启动脚本
└── .gitignore                 # 忽略 .env *.db node_modules/ .cache/
```

## 启动方式

```bash
python start.py
```

会同时启动：
- 后端 uvicorn → `http://localhost:58000`
- 前端 vite → `http://localhost:5173`

启动后自动打开浏览器。服务启动时后台预加载表情包索引。

## API 端点

> 除 `/api/auth/*`、`/api/skills`、公共静态资源外，所有端点需要 `Authorization: Bearer <token>` 请求头。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册新用户（返回 JWT） |
| POST | `/api/auth/login` | 登录（返回 JWT） |
| GET | `/api/auth/me` | 获取当前用户信息 |
| GET | `/api/skills` | 列出所有角色（含头像 URL） |
| GET | `/api/skills/{id}` | 获取角色详情 |
| POST | `/api/skills/upload` | 上传/创建角色（JSON 或 TXT） |
| PUT | `/api/skills/{id}/rename` | 重命名角色（同步更新头像文件和对话引用） |
| DELETE | `/api/skills/{id}` | 删除自定义角色（预设保护） |
| POST | `/api/skills/{id}/avatar` | 上传角色头像 |
| DELETE | `/api/skills/{id}/avatar` | 删除角色头像 |
| DELETE | `/api/skills/{id}/clear-context` | 清空该角色所有对话历史 |
| POST | `/api/skills/optimize-prompt` | AI 优化角色描述（需认证） |
| GET | `/api/conversations` | 列出当前用户的对话 |
| POST | `/api/conversations` | 创建新对话 |
| DELETE | `/api/conversations/{id}` | 删除对话 |
| PUT | `/api/conversations/{id}/rename` | 重命名对话 |
| PUT | `/api/conversations/{id}/skill` | 切换对话角色 |
| GET | `/api/conversations/{id}/messages` | 获取对话消息（含 sticker_url/sticker_emoji/img_desc） |
| POST | `/api/chat/send` | 发送消息（SSE 流式返回，含 clean_text/sticker/done 事件） |
| PUT | `/api/settings/{key}` | 保存当前用户的设置 |
| GET | `/api/settings/{key}` | 读取当前用户的设置 |
| GET | `/api/providers/presets` | 获取 LLM 供应商预设列表 |
| GET | `/api/provider` | 获取当前用户的 LLM 配置 |
| PUT | `/api/provider` | 保存当前用户的 LLM 配置（供应商/URL/模型/Key） |
| GET | `/api/profile` | 获取当前用户资料（名字 + 头像） |
| PUT | `/api/profile` | 更新当前用户名字 |
| POST | `/api/profile/avatar` | 上传用户头像 |
| DELETE | `/api/profile/avatar` | 删除用户头像 |
| GET | `/api/stickers/emoji` | 获取 Emoji 分类映射（前端表情选择器用） |
| GET | `/api/stickers/search?q=xx` | 搜索 ChineseBQB GIF 表情包 |
| GET | `/api/stickers/popular` | 获取推荐 GIF（8 个高频关键词各取 3 条去重） |
| GET | `/api/vision/providers` | 获取视觉模型供应商预设 |
| GET | `/api/vision/check` | 检查当前聊天模型是否支持视觉 |
| GET | `/api/vision/config` | 获取视觉配置（合并查询，一次返回全部） |

## 数据库模型

四张表（SQLite，文件 `server/companion.db`）：

- **users** — id (自增), username (唯一), password_hash (bcrypt), created_at
- **conversations** — id, user_id (FK→users), title, skill_name, created_at, updated_at
- **messages** — id, conversation_id, role(user/assistant), content, sticker_url, sticker_emoji, img_desc, created_at
- **settings** — id (自增, 主键), key, value, user_id (FK→users), UNIQUE(key, user_id)

`.gitignore` 已忽略 `*.db`，不会上传。

启动时 `main.py` 自动执行 `create_all()` 建表 + 迁移：
- messages 表：添加 sticker_url / sticker_emoji / img_desc 列
- conversations 表：添加 user_id 外键
- settings 表：从 key 单主键重建为 id 主键 + UNIQUE(key, user_id)，支持多用户独立配置
- 自动创建默认 admin 用户（admin/admin），将旧数据关联到 admin

### 用户认证

`services/auth.py`：bcrypt 密码哈希 + JWT 令牌（HS256，30 天过期）。`get_current_user()` FastAPI 依赖解析 `Authorization: Bearer <token>` 并返回 `User` 对象。

前端 `AuthPage.tsx`：登录/注册切换 Tab → 调用 `/api/auth/*` → token 存入 localStorage → 所有后续请求携带 `Authorization` 头。登出按钮在侧边栏用户区。

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

### 角色创建流程
点击 `＋` → `NewChatPicker` 提供三种路径：
1. **选择已有角色** → 列出所有角色（带头像），点选即开始聊天
2. **从模板创建** → 选一个预设模板，可修改人设、名字、头像后保存
3. **自定义创建** → 空白表单，填写名字/关系/描述/头像

### 角色管理
`SkillEditor` 提供：重命名（内联编辑，同步更新文件名和对话引用）、上传/删除头像、删除角色（预设保护）。

### 对话命名
新建对话自动以角色名命名（如"小雨"、"阿杰"），不再使用"新的对话"。后端 `create_conversation` 默认取 skill 的 name 字段作为 title。

预设角色（girlfriend/bestie/mentor）受保护，DELETE API 会返回 403。

## 多供应商 LLM 系统

`services/llm.py` 支持通过 OpenAI-compatible SDK 对接多种 LLM 供应商：

| ID | 名称 | 默认模型 |
|----|------|----------|
| `deepseek` | DeepSeek | `deepseek-chat` |
| `openai` | OpenAI | `gpt-4o` |
| `zhipu` | 智谱 GLM | `glm-4-flash` |
| `moonshot` | 月之暗面 Kimi | `moonshot-v1-8k` |
| `qwen` | 通义千问 | `qwen-turbo` |
| `siliconflow` | 硅基流动 | `deepseek-ai/DeepSeek-V3` |
| `custom` | 自定义 | 手动输入 |

配置通过 `settings` 表存储（provider / api_key / base_url / model_name），由 `resolve_provider_config()` 读取。用户可以自定义 base_url 和 model_name 覆盖预设。API Key 查找顺序：DB settings 表 → `.env` 文件 → 占位符。

## 表情包系统

### AI 端（角色发）
1. 系统 prompt 中包含"表情包使用规则"独立段落，引导 AI 用 `[STICKER: 关键词]` 格式
2. 角色 JSON 中的 `sticker_examples` 字段会被注入 prompt，提供示例（如沈知夏）
3. 后端 `chat.py` 通过正则 `\[STICKER[：:]\s*([^\]]+?)\s*\]` 解析关键词
4. `services/sticker.py` 搜索 ChineseBQB 数据集（5800+ 中文 GIF 表情包）
5. 无匹配时回退到 Emoji 关键词映射表（50+ 关键词 → Emoji）
6. 表情包 URL 自动从 GitHub Raw 重写为 jsDelivr CDN（国内可访问）

### 用户端（用户发）
- **Emoji**：点 😊 → Emoji Tab（47 分类网格）→ 选中 → 内嵌到输入框光标位置（微信风格）
- **GIF 动图**：点 😊 → 动图 Tab → 搜索关键词 → 选 GIF → 输入框左侧预览 → 作为大图发送
- **视觉识别**（可选）：用户发送 GIF 后，后端调视觉模型识别图片内容，注入上下文让 AI "看见"

### 数据源
- **ChineseBQB**: GitHub 开源数据集，5800+ 中文 GIF，URL 自动 CDN 重写
- **Emoji 映射表**: `services/sticker.py` 中 `EMOJI_MAP`，50+ 中文关键词 → Emoji
- **索引**: 多镜像下载（jsDelivr CDN → GitHub Raw）→ `.cache/` 缓存 24h → 内置 `data/` 兜底

## 视觉识别（可选）

用户可在设置中开启"图片识别"，让 AI 角色能"看见"用户发的 GIF 表情包：
- 开启后，用户发 GIF → 后台线程异步调视觉模型识别内容 → 描述存入 `messages.img_desc`
- **完全非阻塞**：视觉在 daemon 线程中运行，SSE 流立即启动（0 延迟）。本轮 AI 看到"用户发了一张动图"，下轮对话获得具体描述
- **GIF → PNG 自动转换**：大部分视觉模型（Qwen-VL 等）不支持 GIF 格式，`vision.py` 自动下载 GIF → Pillow 提取首帧 → 转 PNG base64 data URI 传入 API
- 聊天模型支持多模态（GPT-4o / GLM-4V / Qwen-VL）→ 自动复用
- 聊天模型不支持（如 DeepSeek）→ 单独配置视觉 API（硅基流动 / 智谱 / Qwen / OpenAI）
- 视觉调用失败不影响聊天（异常被捕获，`img_desc` 保持 NULL）
- 设置 → 图片识别 → 开关 + 供应商 + 模型 + Key

相关文件：`server/services/vision.py`，前端 `SettingsModal.tsx` 视觉配置区。

## 头像系统

- 角色头像存储在 `server/avatars/{skill_id}.{ext}` (png/jpg/gif/webp)
- 用户头像存储在 `server/avatars/_profile.{ext}`
- 通过 FastAPI `StaticFiles` 挂载 `/avatars` 路径提供服务
- `list_skills()` 自动检测头像文件并返回 URL；无头像时前端显示名字首字母

## 流式聊天 SSE 事件

`POST /api/chat/send` 返回 `text/event-stream`，依次发送：

| 事件 | JSON | 说明 |
|------|------|------|
| token | `{"token": "..."}` | 逐 token 流式文本 |
| clean_text | `{"clean_text": "..."}` | 移除 [STICKER:...] 标记后的干净文本 |
| sticker | `{"sticker": "...", "sticker_type": "image\|emoji", "keyword": "..."}` | 表情包结果 |
| done | `{"done": true}` | 流结束 |
| error | `{"error": "..."}` | 错误信息 |

## 关键注意事项

- **用户认证**：除公共端点外，所有 API 需 `Authorization: Bearer <token>` 头。前端 `apiHeaders()` 统一管理
- **设置按用户隔离**：settings 表主键为 `id`，唯一约束 `UNIQUE(key, user_id)`。每个用户的 API Key、视觉配置等完全独立
- **视觉非阻塞**：`chat.py` 中视觉在 daemon 线程中运行，**使用独立 DB session (`SessionLocal()`)** 更新 `img_desc`。绝不能共享请求的 `db` 会话给后台线程，否则 SQLAlchemy Session 多线程冲突会导致死锁
- **DB 会话线程安全**：SQLAlchemy Session 不是线程安全的。任何后台线程必须通过 `SessionLocal()` 创建自己的会话，不能通过闭包捕获请求的 `db`
- **GIF → PNG**：`vision.py` 检测 `.gif` URL → 下载 → Pillow 提取首帧 → PNG base64 data URI。非 GIF 图片仍直传 URL
- **Windows 编码**：终端输出中文可能乱码，不影响功能
- **npm.cmd**：Windows 上 npm 是 `.cmd` 文件，`start.py` 的 `find_npm()` 已处理
- **端口**：后端 58000，前端 5173，`start.py` 启动前自动释放占用
- **CORS**：`main.py` 允许 `localhost:5173` 跨域
- **流式输出**：`chat.py` 返回 SSE (`text/event-stream`)，前端 `useChat.ts` 逐 token 渲染
- **数据库自动创建**：`main.py` 启动时 `create_all()` 自动建表 + 迁移旧库，clone 后开箱即用
- **表情包预加载**：`main.py` 启动时后台线程预加载 ChineseBQB 索引（多源：CDN → 本地缓存 → 内置兜底）
- **防重复发送**：`ChatInput.tsx` 用 ref 同步清空文本 + `e.repeat` 拦截 + lockRef 锁定；`useChat.ts` 用 sendingRef 防止闭包陷阱
- **表情包标记清理**：`chat.py` 中 `parse_stickers()` 剥离 `[STICKER:xxx]` 后，还有 `strip_narration_brackets()` 防御性过滤 AI 模仿的叙述文本。前端 `useChat.ts` 的 sticker 事件中也对 content 做正则清理兜底
- **上下文标注隔离**：`memory.py` 不把贴纸标注拼入消息内容（会被 AI 模仿），而是汇总为独立的 `system` 角色消息插入上下文顶部
- **设置面板加载**：`GET /api/provider` 直接返回完整 `api_key`，前端读取显示。视觉配置通过 `GET /api/vision/config` 一次获取全部，避免串行多次请求
