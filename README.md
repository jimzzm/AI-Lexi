# AI Lexi

Let AI optimize, organize, and enhance your documents in the Obsidian sidebar. Supports Ollama, DeepSeek, Doubao (Volcengine Ark), and other LLM providers.

[中文说明](README_CN.md)

## Supported Providers

Ollama, DeepSeek, Xiaomi MiMo, Kimi, Qwen, GLM, MiniMax, Doubao (Volcengine Ark)

## Installation

### Method 1: Download from Releases (Recommended)

1. Download the latest `main.js`, `manifest.json`, and `styles.css` from [Releases](https://github.com/jimzzm/AI-Lexi/releases)
2. Create folder `<Your Vault>/.obsidian/plugins/ai-lexi/`
3. Copy the three files into that folder
4. Enable **AI Lexi** in Settings > Community plugins
5. Configure your API endpoint and key in the plugin settings

### Method 2: Clone and Build

1. Clone this repo into `<Your Vault>/.obsidian/plugins/ai-lexi/`
2. Run `npm install && npm run build`
3. Enable in Settings > Community plugins

## Features

- Multi-turn chat with automatic context
- Tool calling: read and write note files
- Auto-attach current note as context
- Support for CLAUDE.md custom instructions
- Vision models: send note images to Ollama vision models for analysis
- VRAM management: auto-release memory on model switch or new conversation
- Chinese UI

## Network Services

This plugin communicates with the following remote services to provide AI chat functionality. No data is collected, stored, or transmitted beyond what is required for the chat interaction:

- **Ollama** (local): Connects to a locally running Ollama instance. No external network requests.
- **DeepSeek API**: Sends chat messages to `api.deepseek.com` for AI responses.
- **Xiaomi MiMo API**: Sends chat messages to the Xiaomi MiMo endpoint for AI responses.
- **Kimi API**: Sends chat messages to the Kimi API for AI responses.
- **Qwen API (Alibaba Cloud)**: Sends chat messages to the DashScope API for AI responses.
- **GLM API (Zhipu AI)**: Sends chat messages to the Zhipu AI API for AI responses.
- **MiniMax API**: Sends chat messages to the MiniMax API for AI responses.
- **Doubao (Volcengine Ark) API (Volcengine)**: Sends chat messages to the Volcengine endpoint for AI responses.

All API keys are stored locally on your device and are never transmitted to any third party.

## Configuration

- Ollama context window (num_ctx) adjustable slider (2048~131072)
- Image analysis prompt template (for vision models)

## Development

```bash
npm install
npm run dev    # Dev mode (watch)
npm run build  # Production build
```

## Tech Stack

- TypeScript + esbuild
- Obsidian Plugin API
- OpenAI-compatible format (DeepSeek, Kimi, GLM, Qwen, MiniMax, Doubao (Volcengine Ark), Xiaomi)
- Ollama native API
- Dynamic provider architecture

## License

MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgements

- [Claudian](https://github.com/YishenTu/claudian) — UI design and interaction patterns
- [Obsidian](https://obsidian.md) — Powerful plugin API
