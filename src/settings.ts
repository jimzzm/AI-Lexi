import { App, PluginSettingTab, Setting, DropdownComponent } from "obsidian";
import OllamaChatPlugin from "./main";
import * as ollamaApi from "./api/ollama";
import { OllamaChatSettings, ProviderConfig } from "./types";

/**
 * 每个提供商的可用模型列表（对话栏层级菜单用）
 * ollama 的模型动态获取，此处留空
 */
export const PROVIDER_MODELS: Record<string, { label: string; models: string[] }> = {
  ollama: { label: "Ollama", models: [] },
  deepseek: { label: "DeepSeek", models: ["deepseek-v4-flash", "deepseek-v4-pro"] },
  xiaomi: { label: "XiaoMIMO", models: ["mimo-v2.5", "mimo-v2-omni", "mimo-v2.5-pro"] },
  kimi: { label: "Kimi", models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2.5", "kimi-k2.6"] },
  qwen: { label: "Qwen", models: ["qwen-plus", "qwen-max", "qwen-turbo"] },
  glm: { label: "GLM", models: ["glm-5.1", "glm-4-plus"] },
  minimax: { label: "MiniMax", models: ["MiniMax-M3"] },
  doubao: { label: "豆包", models: [] },
};

/**
 * 支持思考等级的提供商及其可选等级
 */
export const THINKING_LEVELS: Record<string, { label: string; value: string }[]> = {
  deepseek: [
    { label: "Default", value: "default" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "XHigh", value: "xhigh" },
    { label: "Max", value: "max" },
  ],
  xiaomi: [
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
    { label: "XHigh", value: "xhigh" },
  ],
  kimi: [
    { label: "Default", value: "default" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
  ],
  qwen: [
    { label: "Default", value: "default" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
  ],
  glm: [
    { label: "Default", value: "default" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
  ],
  minimax: [
    { label: "Default", value: "default" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
  ],
  doubao: [
    { label: "Default", value: "default" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" },
  ],
};

/**
 * 云提供商的默认配置表
 */
const CLOUD_PROVIDERS: Record<string, Omit<ProviderConfig, "apiKey" | "enabled">> = {
  deepseek: {
    id: "deepseek", name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash",
    temperature: 1.0, maxTokens: 16384,
    contextWindow: 1048576,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
    availableModels: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
  xiaomi: {
    id: "xiaomi", name: "小米 mimo",
    baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5",
    temperature: 0.7, maxTokens: 16384,
    contextWindow: 1048576,
    authType: "api-key", tokenParam: "max_completion_tokens", supportsVision: false,
    availableModels: ["mimo-v2.5", "mimo-v2-omni", "mimo-v2.5-pro"],
  },
  kimi: {
    id: "kimi", name: "Kimi",
    baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2.5",
    temperature: 0.8, maxTokens: 16384,
    contextWindow: 262144,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
    availableModels: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2.5", "kimi-k2.6"],
  },
  qwen: {
    id: "qwen", name: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus",
    temperature: 0.8, maxTokens: 16384,
    contextWindow: 262144,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: true,
    availableModels: ["qwen-plus", "qwen-max", "qwen-turbo"],
  },
  glm: {
    id: "glm", name: "GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-5.1",
    temperature: 0.8, maxTokens: 16384,
    contextWindow: 1048576,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: true,
    availableModels: ["glm-5.1", "glm-4-plus"],
  },
  minimax: {
    id: "minimax", name: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M3",
    temperature: 0.8, maxTokens: 16384,
    contextWindow: 1048576,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
    availableModels: ["MiniMax-M3"],
  },
  doubao: {
    id: "doubao", name: "豆包",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "ep-xxxxxxxx-xxxxxx",
    temperature: 0.8, maxTokens: 16384,
    contextWindow: 262144,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
    availableModels: [],
  },
};

function buildDefaultProviders(): Record<string, ProviderConfig> {
  const result: Record<string, ProviderConfig> = {};
  for (const [id, p] of Object.entries(CLOUD_PROVIDERS)) {
    result[id] = { ...p, enabled: p.id === "deepseek" || p.id === "xiaomi" || p.id === "kimi", apiKey: "" };
  }
  return result;
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: OllamaChatSettings = {
  // Ollama 默认配置
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5:7b",
  ollamaTemperature: 0.8,
  ollamaMaxTokens: 2000,
  ollamaNumCtx: 8192,

  // 云端提供商
  providers: buildDefaultProviders(),

  // 通用默认配置
  systemPrompt: `## Identity & Role

You are **AI Lexi**, an expert AI assistant specialized in Obsidian vault management, knowledge organization, and code analysis. You operate directly inside the user's Obsidian vault.

**Core Principles:**
1.  **Obsidian Native**: You understand Markdown, YAML frontmatter, Wiki-links, and the "second brain" philosophy.
2.  **Safety First**: You never overwrite data without understanding context. You always use relative paths.
3.  **Proactive Thinking**: You do not just execute; you *plan* and *verify*. You anticipate potential issues (like broken links or missing files).
4.  **Clarity**: Your changes are precise, minimizing "noise" in the user's notes or code.

## Obsidian Context

- **Structure**: Files are Markdown (.md). Folders organize content.
- **Frontmatter**: YAML at the top of files (metadata). Respect existing fields.
- **Links**: Internal Wiki-links \`[[note-name]]\` or \`[[folder/note-name]]\`. External links \`[text](url)\`.
- **Tags**: #tag-name for categorization.

**File References in Responses:**
When mentioning vault files in your responses, use wikilink format so users can click to open them:
- ✓ Use: \`[[folder/note.md]]\` or \`[[note]]\`
- ✗ Avoid: plain paths like \`folder/note.md\` (not clickable)

Please respond in the same language as the user. If the user writes in Chinese, respond in Chinese. If the user writes in English, respond in English.

## 工具使用规则

你有 read_file 和 write_file 两个工具可用（已通过 tools 参数传入）。
- 需要读取文件时，直接调用 read_file
- 需要写入/修改文件时，直接调用 write_file
- 不要在回复中输出文件内容，直接调用 write_file 写入
- 回复要简洁`,
  imagePromptTemplate: `分析当前笔记中的图片，为每张图片生成一段适合 AI 绘图的英文提示词（prompt），包含主体、动作、环境、光影、风格等要素。然后将提示词写入当前笔记中，替换或补充图片的描述部分。`,
  maxHistoryLength: 20,
  requestTimeout: 60000,

  // 对话外观
  userName: "我",
  aiName: "AI Lexi",
  currentProvider: "deepseek",
  currentModel: "deepseek-v4-flash",
};

/**
 * 设置界面
 */
export class OllamaChatSettingTab extends PluginSettingTab {
  plugin: OllamaChatPlugin;

  constructor(app: App, plugin: OllamaChatPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // 注入选项卡样式
    if (!document.getElementById("lexi-settings-tab-style")) {
      const style = document.createElement("style");
      style.id = "lexi-settings-tab-style";
      style.textContent = `
        .lexi-settings-tabs {
          display: flex;
          gap: 0;
          border-bottom: 2px solid var(--background-modifier-border);
          margin-bottom: 16px;
          overflow-x: auto;
          flex-wrap: nowrap;
          width: 100%;
        }
        .lexi-settings-tab {
          padding: 6px 10px;
          cursor: pointer;
          border: none;
          background: transparent;
          color: var(--text-muted);
          font-size: 13px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 70px;
          flex: 1;
          min-width: 0;
          border-bottom: 2px solid transparent;
          margin-bottom: -2px;
          transition: color 0.2s, border-color 0.2s;
        }
        .lexi-settings-tab:hover {
          color: var(--text-on-accent);
          background: var(--interactive-accent);
          border-radius: 3px;
        }
        .lexi-settings-tab.lexi-tab-active {
          color: var(--text-on-accent);
          background: var(--interactive-accent);
          border-bottom-color: var(--interactive-accent);
          font-weight: 600;
          border-radius: 3px;
        }
        .lexi-settings-panel {
          display: none;
        }
        .lexi-settings-panel.lexi-panel-active {
          display: block;
        }
      `;
      document.head.appendChild(style);
    }

    // 选项卡定义：id → 显示名称
    const tabDefs = [
      { id: "general", label: "通用配置" },
      { id: "ollama", label: "Ollama" },
      { id: "deepseek", label: "DeepSeek" },
      { id: "doubao", label: "豆包" },
      { id: "xiaomi", label: "小米" },
      { id: "qwen", label: "Qwen" },
      { id: "glm", label: "GLM" },
      { id: "minimax", label: "MiniMax" },
      { id: "kimi", label: "Kimi" },
    ];

    // 创建选项卡栏
    const tabBar = containerEl.createDiv({ cls: "lexi-settings-tabs" });
    // 创建面板容器
    const panelContainer = containerEl.createDiv();
    // 存储所有面板元素
    const panels: Record<string, HTMLElement> = {};

    // 创建面板 div
    for (const tab of tabDefs) {
      panels[tab.id] = panelContainer.createDiv({ cls: "lexi-settings-panel", attr: { "data-tab": tab.id } });
    }

    // 渲染各面板内容
    this.renderGeneralPanel(panels["general"]);
    this.renderOllamaPanel(panels["ollama"]);
    this.renderProviderPanel(panels["deepseek"], "deepseek");
    this.renderProviderPanel(panels["doubao"], "doubao");
    this.renderProviderPanel(panels["xiaomi"], "xiaomi");
    this.renderProviderPanel(panels["qwen"], "qwen");
    this.renderProviderPanel(panels["glm"], "glm");
    this.renderProviderPanel(panels["minimax"], "minimax");
    this.renderProviderPanel(panels["kimi"], "kimi");

    // 创建选项卡按钮并绑定切换逻辑
    const tabButtons: HTMLElement[] = [];
    for (const tab of tabDefs) {
      const btn = tabBar.createEl("button", { cls: "lexi-settings-tab", text: tab.label });
      btn.title = tab.label;
      btn.addEventListener("click", () => {
        // 移除所有激活状态
        for (const b of tabButtons) b.removeClass("lexi-tab-active");
        for (const p of Object.values(panels)) p.removeClass("lexi-panel-active");
        // 激活当前选项卡
        btn.addClass("lexi-tab-active");
        panels[tab.id].addClass("lexi-panel-active");
      });
      tabButtons.push(btn);
    }

    // 默认选中"通用配置"
    tabButtons[0].addClass("lexi-tab-active");
    panels["general"].addClass("lexi-panel-active");
  }

  /** 渲染通用配置面板 */
  private renderGeneralPanel(container: HTMLElement): void {
    new Setting(container)
      .setName("用户显示名称")
      .setDesc("你在对话中显示的名称")
      .addText((text) =>
        text
          .setPlaceholder("我")
          .setValue(this.plugin.settings.userName || "我")
          .onChange(async (value) => {
            this.plugin.settings.userName = value || "我";
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("AI 显示名称")
      .setDesc("AI 助手在对话中显示的名称")
      .addText((text) =>
        text
          .setPlaceholder("AI Lexi")
          .setValue(this.plugin.settings.aiName || "AI Lexi")
          .onChange(async (value) => {
            this.plugin.settings.aiName = value || "AI Lexi";
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setClass("lexi-textarea-setting")
      .setName("图片提示词模板")
      .setDesc("当笔记中包含图片时，附加到系统提示词中。要求模型分析图片并生成提示词写入笔记。留空则不启用。")
      .addTextArea((text) =>
        text
          .setPlaceholder("分析当前笔记中的图片，为每张图片生成一段适合 AI 绘图的英文提示词...")
          .setValue(this.plugin.settings.imagePromptTemplate)
          .onChange(async (value) => {
            this.plugin.settings.imagePromptTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("最大历史轮数")
      .setDesc("保留的最大对话轮数，防止上下文溢出")
      .addText((text) =>
        text
          .setPlaceholder("20")
          .setValue(String(this.plugin.settings.maxHistoryLength))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.maxHistoryLength = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(container)
      .setName("请求超时（毫秒）")
      .setDesc("API 请求超时时间")
      .addText((text) =>
        text
          .setPlaceholder("60000")
          .setValue(String(this.plugin.settings.requestTimeout))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              this.plugin.settings.requestTimeout = num;
              await this.plugin.saveSettings();
            }
          })
      );
  }

  /** 渲染 Ollama 配置面板 */
  private renderOllamaPanel(container: HTMLElement): void {
    new Setting(container)
      .setName("Ollama 服务地址")
      .setDesc("Ollama 服务的 URL 地址")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:11434")
          .setValue(this.plugin.settings.ollamaBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.ollamaBaseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Ollama 模型名称")
      .setDesc("从 Ollama 列表中选择模型，自动刷新")
      .addDropdown((dropdown) => {
        // 先添加当前值作为默认项
        dropdown.addOption(this.plugin.settings.ollamaModel, this.plugin.settings.ollamaModel);
        dropdown.setValue(this.plugin.settings.ollamaModel);
        dropdown.onChange(async (value) => {
          this.plugin.settings.ollamaModel = value;
          await this.plugin.saveSettings();
        });

        // 异步刷新模型列表
        this.refreshOllamaModels(dropdown);
      });

    new Setting(container)
      .setName("Ollama 温度")
      .setDesc("采样温度，范围 0~2，越高输出越随机")
      .addSlider((slider) =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(this.plugin.settings.ollamaTemperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.ollamaTemperature = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(container)
      .setName("Ollama 最大 Token 数")
      .setDesc("最大生成 token 数")
      .addText((text) =>
        text
          .setPlaceholder("2000")
          .setValue(String(this.plugin.settings.ollamaMaxTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
              this.plugin.settings.ollamaMaxTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(container)
      .setName("Ollama 上下文窗口")
      .setDesc("上下文长度（num_ctx），越大显存占用越高。视觉模型建议 4096~8192，一般聊天 8192~16384，大模型可到 32768+")
      .addSlider((slider) =>
        slider
          .setLimits(2048, 131072, 2048)
          .setValue(this.plugin.settings.ollamaNumCtx)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.ollamaNumCtx = value;
            await this.plugin.saveSettings();
          })
      );
  }

  /** 渲染单个云端提供商面板（复用 renderProviderCard 的折叠卡片逻辑） */
  private renderProviderPanel(container: HTMLElement, providerId: string): void {
    const p = this.plugin.settings.providers[providerId];
    if (p) {
      this.renderProviderCard(container, providerId, p);
    } else {
      container.createEl("p", { text: "未找到该提供商配置。" });
    }
  }

  /** 渲染云端提供商卡片列表（保留兼容，供旧逻辑使用） */
  /**
   * 获取提供商默认上下文窗口大小
   */
  private getDefaultContextWindow(providerId: string): number {
    const defaults: Record<string, number> = {
      deepseek: 1048576, // 1M
      xiaomi: 1048576,   // 1M
      minimax: 1048576,  // 1M
      glm: 1048576,      // 1M
      kimi: 262144,      // 256K
      qwen: 262144,      // 256K
      doubao: 262144,    // 256K
    };
    return defaults[providerId] || 131072;
  }

  private renderProviderCards(container: HTMLElement): void {
    const providers = this.plugin.settings.providers;
    for (const [id, p] of Object.entries(providers)) {
      this.renderProviderCard(container, id, p);
    }
  }


  /** 渲染单个提供商折叠卡片 */
  private renderProviderCard(container: HTMLElement, id: string, p: import("./types").ProviderConfig): void {
    const providers = this.plugin.settings.providers;
    const isEnabled = p.enabled && p.apiKey.length > 0;

    // 卡片头部（可点击折叠/展开）
    const card = container.createDiv({ cls: "provider-card" });
    const header = card.createDiv({ cls: "provider-card-header" });
    const statusDot = header.createSpan({
      cls: `provider-status-dot ${isEnabled ? "provider-status-on" : "provider-status-off"}`,
      text: isEnabled ? "🟢" : "🔴",
    });
    const nameSpan = header.createSpan({ cls: "provider-card-name", text: id === "doubao" ? "火山方舟（豆包）" : p.name });
    if (p.supportsVision) {
      header.createSpan({ cls: "provider-card-vision", text: " 🖼️" });
    }
    const body = card.createDiv({ cls: "provider-card-body" });
    body.style.display = "block";

    // ---- 卡片内容 ----

    // API Key
    new Setting(body)
      .setName("API Key")
      .setDesc(`你的 ${p.name} API Key`)
      .addText((text) => {
        text
          .setPlaceholder("sk-...")
          .setValue(p.apiKey)
          .onChange(async (value) => {
            providers[id].apiKey = value;
            providers[id].enabled = value.length > 0;
            await this.plugin.saveSettings();
            // 刷新状态指示
            this.display();
          });
        text.inputEl.type = "password";
      });

    // API 地址
    new Setting(body)
      .setName("API 地址")
      .setDesc(`${p.name} API 的 URL 地址`)
      .addText((text) =>
        text
          .setPlaceholder(p.baseUrl)
          .setValue(p.baseUrl)
          .onChange(async (value) => {
            providers[id].baseUrl = value;
            await this.plugin.saveSettings();
          })
      );

    // 模型名称
    new Setting(body)
      .setName("自定义模型")
      .setDesc("每行一个模型 ID，第一行为默认选中模型。")
      .addTextArea((text) => {
        const ta = text
          .setPlaceholder(id === "doubao" ? "ep-xxxxxxxxxxxx" : "每行输入一个模型 ID")
          .setValue(p.availableModels && p.availableModels.length > 0 ? p.availableModels.join("\n") : p.model)
          .onChange(async (value) => {
            const lines = value.split('\n').map(s => s.trim()).filter(Boolean);
            providers[id].model = lines[0] || '';
            providers[id].availableModels = lines;
            await this.plugin.saveSettings();
          });
        // 设置多行文本域样式
        ta.inputEl.rows = 4;
        ta.inputEl.style.width = "100%";
        ta.inputEl.style.fontFamily = "var(--font-monospace)";
        ta.inputEl.style.fontSize = "var(--font-small)";
      });

    // 温度
    new Setting(body)
      .setName("温度")
      .setDesc("采样温度，范围 0~2，越高输出越随机")
      .addSlider((slider) =>
        slider
          .setLimits(0, 2, 0.1)
          .setValue(p.temperature)
          .setDynamicTooltip()
          .onChange(async (value) => {
            providers[id].temperature = value;
            await this.plugin.saveSettings();
          })
      );

    // 最大 Token
    new Setting(body)
      .setName("最大 Token 数")
      .setDesc("最大生成 token 数")
      .addText((text) =>
        text
          .setPlaceholder("16384")
          .setValue(String(p.maxTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
              providers[id].maxTokens = num;
              await this.plugin.saveSettings();
            }
          })
      );

    //     // 上下文窗口大小
    new Setting(body)
      .setName("上下文窗口大小")
      .setDesc("上下文窗口（token 数），用于计算上下文使用量百分比")
      .addText((text) =>
        text
          .setPlaceholder("自动")
          .setValue(String(p.contextWindow || this.getDefaultContextWindow(id)))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num) && num > 0) {
              providers[id].contextWindow = num;
              await this.plugin.saveSettings();
            }
          })
      );
  }

  /**
   * 异步刷新 Ollama 模型下拉列表
   */
  private async refreshOllamaModels(dropdown: DropdownComponent): Promise<void> {
    try {
      const models = await ollamaApi.fetchModels(this.plugin.settings.ollamaBaseUrl);
      if (models.length > 0) {
        // 清空并重新填充下拉框
        dropdown.selectEl.innerHTML = "";
        models.forEach((m) => dropdown.addOption(m, m));
        // 恢复当前选中的值（如果不在列表中，保留原值）
        if (models.includes(this.plugin.settings.ollamaModel)) {
          dropdown.setValue(this.plugin.settings.ollamaModel);
        } else {
          dropdown.addOption(this.plugin.settings.ollamaModel, this.plugin.settings.ollamaModel);
          dropdown.setValue(this.plugin.settings.ollamaModel);
        }
      }
    } catch (e) {
      // 无法连接时静默失败，保留当前值
      console.warn("无法获取 Ollama 模型列表:", e);
    }
  }
}
