# AI Lexi

在 Obsidian 侧边栏中让 AI 为你的文档提供优化、整理等操作，支持 Ollama、DeepSeek、豆包等大模型。

原名 Ollama Chat。UI 和交互设计参考自 [Claudian](https://github.com/YishenTu/claudian)。

[English](README.md)

## 支持的提供商

| 提供商 | 默认模型 | 工具调用 | 视觉/图片 |
|--------|---------|----------|-----------|
| Ollama | 本地模型（如 Qwen2.5、Gemma） | 原生 + 文本解析 | 支持 |
| DeepSeek | deepseek-v4-flash | function calling | 不支持 |
| 小米 MiMo | mimo-v2.5 | 文本解析 | 不支持 |
| Kimi | kimi-for-coding | function calling | 不支持 |
| Qwen | qwen-plus | function calling | qwen-vl 系列 |
| GLM | glm-5.1 | function calling | glm-4v 系列 |
| MiniMax | MiniMax-M3 | function calling | 不支持 |
| 豆包 | ep-xxxxxxxx-xxxxxx（推理接入点） | function calling | 不支持 |

## 安装

### 方法一：通过 Releases 下载（推荐）

1. 前往 [Releases](https://github.com/jimzzm/AI-Lexi/releases) 页面下载最新版本的 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Obsidian 仓库下创建文件夹 `<你的仓库>/.obsidian/plugins/ai-lexi/`
3. 将三个文件复制到该文件夹
4. 在 Obsidian 设置 → 第三方插件中启用 **AI Lexi**
5. 在插件设置中配置 API 地址和密钥

### 方法二：克隆仓库

1. 将仓库克隆到 `<你的仓库>/.obsidian/plugins/ai-lexi/`
2. 运行 `npm install && npm run build`
3. 在 Obsidian 设置 → 第三方插件中启用

## 功能

- 多轮对话，自动携带上下文
- 工具调用：读取和写入笔记文件
- 自动加载当前笔记上下文
- 支持 CLAUDE.md 自定义指令
- 视觉模型：提取笔记中的图片传给 Ollama 视觉模型分析
- 显存管理：切换模型/新对话时自动释放显存
- 中文界面

## 网络服务

本插件会与以下远程服务通信以提供 AI 聊天功能。除聊天交互本身所需的数据外，不收集、存储或传输任何其他数据：

- **Ollama**（本地）：连接本地运行的 Ollama 实例，不发起外部网络请求。
- **DeepSeek API**：向 `api.deepseek.com` 发送聊天消息以获取 AI 回复。
- **小米 MiMo API**：向小米 MiMo 端点发送聊天消息以获取 AI 回复。
- **Kimi API**：向 Kimi API 发送聊天消息以获取 AI 回复。
- **Qwen API（阿里云）**：向 DashScope API 发送聊天消息以获取 AI 回复。
- **GLM API（智谱 AI）**：向智谱 AI API 发送聊天消息以获取 AI 回复。
- **MiniMax API**：向 MiniMax API 发送聊天消息以获取 AI 回复。
- **豆包 API（火山引擎）**：向火山引擎端点发送聊天消息以获取 AI 回复。

所有 API 密钥均存储在本地设备上，不会传输给任何第三方。

## 配置

- Ollama 上下文窗口（num_ctx）可调滑块（2048~131072）
- 图片分析提示词模板（用于视觉模型）

## 开发

```bash
npm install
npm run dev    # 开发模式（监听文件变化）
npm run build  # 生产构建
```

## 技术栈

- TypeScript + esbuild
- Obsidian Plugin API
- OpenAI 兼容格式（DeepSeek、Kimi、GLM、Qwen、MiniMax、豆包、小米）
- Ollama 原生 API
- 动态提供商架构

## 许可

MIT License。详见 [LICENSE](LICENSE) 文件。

## 致谢

- [Claudian](https://github.com/YishenTu/claudian) — UI 设计和交互模式
- [Obsidian](https://obsidian.md) — 强大的插件 API
