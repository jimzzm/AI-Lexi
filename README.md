# AI Lexi

![GitHub release](https://img.shields.io/github/v/release/jimzzm/AI-Lexi)
![License](https://img.shields.io/github/license/jimzzm/AI-Lexi)

> 中文版说明请见 [README_CN.md](README_CN.md)

AI Lexi is an Obsidian plugin that brings AI chat directly into your sidebar. No external CLI tools, no complicated setup — just configure your API key and start talking to AI right inside Obsidian.

## Features & Usage

Open the chat sidebar from the ribbon icon. Everything works by talking directly to the AI — tell it to read, write, edit, or organize your notes. No command line needed, no external tools. Just natural language. Friendly for non-coders.

**Direct Editing** — Select text in your current note and ask the AI to rewrite, optimize, or translate it. Or just describe what you want changed and the AI handles it.

**Multi-Tab & Conversations** — Up to 3 parallel chat tabs. Each tab keeps its own history. New conversation, resume, fork, or compact whenever you need.

**Tool Calling** — The AI can read and write your vault files directly. Ask it to find notes, summarize folders, or create new pages.

**CLAUDE.md Support** — Place a \CLAUDE.md\ in your vault root with custom instructions the AI will follow.

## Supported Providers

8 providers out of the box:

- **Ollama** (local, free)
- **DeepSeek**, **Xiaomi MiMo**, **Kimi**, **Qwen**, **GLM**, **MiniMax**, **Doubao** (cloud)

All use the same settings interface — fill API key, pick model, start chatting.

## Installation

### From GitHub Releases (Recommended)

1. Download \main.js\, \manifest.json\, \styles.css\ from [Releases](https://github.com/jimzzm/AI-Lexi/releases)
2. Create \<Your Vault>/.obsidian/plugins/ai-lexi/\ folder
3. Copy the three files in
4. Enable **AI Lexi** in Obsidian Settings → Community plugins
5. Configure your provider in the plugin settings

### From Source

\\ash
cd <Your Vault>/.obsidian/plugins
git clone https://github.com/jimzzm/AI-Lexi.git
cd AI-Lexi
npm install && npm run build
\
## Development

\\ash
npm install
npm run dev    # Watch mode
npm run build  # Production build
\
## License

MIT License. See [LICENSE](LICENSE) for details.

## Acknowledgements

- [Claudian](https://github.com/YishenTu/claudian) — UI design and interaction patterns
- [Obsidian](https://obsidian.md) — Powerful plugin API
