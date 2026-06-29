# AI Lexi

![GitHub release](https://img.shields.io/github/v/release/jimzzm/AI-Lexi)
![License](https://img.shields.io/github/license/jimzzm/AI-Lexi)

[English](README.md)

AI Lexi 是一款 Obsidian 插件，将 AI 聊天直接嵌入你的侧边栏。不需要装任何外部命令行工具，不需要折腾环境，配置好 API 密钥就能直接用自然语言和 AI 对话。

## 功能与使用方法

从功能区图标（侧边栏里的机器人图标）打开聊天侧边栏。选定文本或打开笔记，直接用自然语言告诉 AI 你想做什么，它就能读取、写入、编辑和整理你的笔记。**全程不用命令行，对不熟悉代码的人也非常友好。**

**直接编辑** — 选定当前笔记中的一段文字，告诉 AI 帮你修改、优化或翻译。或者描述你想要的效果，AI 会自动处理。

**多标签页和对话** — 最多 3 个并行聊天标签页，每个标签页独立维护对话历史。支持新建对话、恢复历史、压缩上下文。

**工具调用** — AI 可以直接读写你的 Obsidian 笔记文件。让它查找笔记、总结文件夹、创建新页面都可以。

**CLAUDE.md 支持** — 在库目录放一个 `CLAUDE.md` 文件，写入自定义指令，AI 会遵循这些指令工作。

## 支持的提供商

开箱即用 8 个提供商：

- **Ollama**（本地免费）
- **DeepSeek**、**小米 MiMo**、**Kimi**、**Qwen**、**GLM**、**MiniMax**、**豆包**（火山方舟）

所有提供商使用统一的设置界面 — 填 API 密钥、选模型、开始聊天。

## 隐私与数据使用

- **Ollama（本地）** — 所有数据都在本地，不发起任何外部网络请求。
- **云端提供商** — 你的消息和笔记内容会发送到对应厂商的 API 服务器进行处理。这是云 AI 服务的标准流程。
- **API 密钥** — 以明文形式存储在 Obsidian 本地设置文件中，不会传输给任何第三方。
- **无遥测** — 本插件没有统计分析、没有回传、没有除聊天请求外的任何后台网络活动。
## 安装

### 从 GitHub Releases 下载（推荐）

1. 从 [Releases](https://github.com/jimzzm/AI-Lexi/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 在你的 Obsidian 库下创建 `<你的库>/.obsidian/plugins/ai-lexi/` 文件夹
3. 把三个文件复制进去
4. 在 Obsidian 设置 → 第三方插件中启用 **AI Lexi**
5. 在插件设置中配置你的提供商

### 从源码构建

```bash
cd <你的库>/.obsidian/plugins
git clone https://github.com/jimzzm/AI-Lexi.git
cd AI-Lexi
npm install && npm run build
```

然后在 Obsidian 设置 → 第三方插件中启用。

## 开发

```bash
npm install
npm run dev    # 监听模式
npm run build  # 生产构建
```

## 许可

MIT License。详见 [LICENSE](LICENSE) 文件。

## 致谢

- [Claudian](https://github.com/YishenTu/claudian) — UI 设计和交互模式
- [Obsidian](https://obsidian.md) — 强大的插件 API