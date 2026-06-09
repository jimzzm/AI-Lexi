# AI Lexi — Obsidian 侧边栏 AI 聊天插件

在 Obsidian 侧边栏中与 AI 进行多轮对话，支持本地 Ollama 和国内外云 API。原名 Ollama Chat。

本项目的 UI 和交互设计参考自 [Claudian](https://github.com/YishenTu/claudian)，感谢原作者的开源工作。

## 支持的模型

| 提供商 | 默认模型 | 工具调用 | 视觉/图片 |
|--------|---------|----------|-----------|
| Ollama | 本地模型（如 Qwen2.5、Gemma） | ✅ 原生 + 文本解析 | ✅ 视觉模型 |
| DeepSeek | deepseek-v4-flash | ✅ function calling | ❌ |
| 小米 mimo | mimo-v2.5 | ✅ 文本解析 | ❌ |
| Kimi | kimi-for-coding | ✅ function calling | ❌ |
| Qwen | qwen-plus | ✅ function calling | ✅ qwen-vl 系列 |
| GLM | glm-5.1 | ✅ function calling | ✅ glm-4v 系列 |
| MiniMax | MiniMax-M3 | ✅ function calling | ❌ |
| 豆包 | ep-xxxxxxxx-xxxxxx（推理接入点） | ✅ function calling | ❌ |

## 安装

1. 将插件文件夹复制到 `<vault>/.obsidian/plugins/obsidian-ai-lexi/`
2. 在 Obsidian 设置 → 第三方插件中启用
3. 在插件设置中配置 API 地址和密钥

## 功能

- 多轮对话，自动携带上下文
- 工具调用：读取和写入笔记文件
- 自动加载当前笔记上下文
- 支持 CLAUDE.md 自定义指令
- **视觉模型**：提取笔记中的图片传给 Ollama 视觉模型分析
- **显存管理**：切换模型/新对话时自动释放显存
- 中文界面

## 配置

- Ollama 上下文窗口（num_ctx）可调滑块（2048~131072）
- 图片分析提示词模板（用于视觉模型）
- 系统提示词自定义

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

## Acknowledgements

- [Claudian](https://github.com/YishenTu/claudian) — UI design and interaction patterns
- [Obsidian](https://obsidian.md) — Powerful plugin API
