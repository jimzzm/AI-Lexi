import { App, PluginSettingTab, Setting, DropdownComponent } from "obsidian";
import OllamaChatPlugin from "./main";
import * as ollamaApi from "./api/ollama";
import { OllamaChatSettings, ProviderConfig } from "./types";

/**
 * 云提供商的默认配置表
 */
const CLOUD_PROVIDERS: Record<string, Omit<ProviderConfig, "apiKey" | "enabled">> = {
  deepseek: {
    id: "deepseek", name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1", model: "deepseek-v4-flash",
    temperature: 1.0, maxTokens: 4000,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
  },
  xiaomi: {
    id: "xiaomi", name: "小米 mimo",
    baseUrl: "https://api.xiaomimimo.com/v1", model: "mimo-v2.5",
    temperature: 0.7, maxTokens: 4000,
    authType: "api-key", tokenParam: "max_completion_tokens", supportsVision: false,
  },
  kimi: {
    id: "kimi", name: "Kimi",
    baseUrl: "https://api.kimi.com/coding/v1", model: "kimi-for-coding",
    temperature: 0.8, maxTokens: 4000,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
  },
  qwen: {
    id: "qwen", name: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus",
    temperature: 0.8, maxTokens: 4000,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: true,
  },
  glm: {
    id: "glm", name: "GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-5.1",
    temperature: 0.8, maxTokens: 4000,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: true,
  },
  minimax: {
    id: "minimax", name: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-M3",
    temperature: 0.8, maxTokens: 4000,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
  },
  doubao: {
    id: "doubao", name: "豆包",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "ep-xxxxxxxx-xxxxxx",
    temperature: 0.8, maxTokens: 4000,
    authType: "bearer", tokenParam: "max_tokens", supportsVision: false,
  },
};

function buildDefaultProviders(): Record<string, ProviderConfig> {
  const result: Record<string, ProviderConfig> = {};
  for (const [id, p] of Object.entries(CLOUD_PROVIDERS)) {
    result[id] = { ...p, enabled: p.id === "deepseek" || p.id === "xiaomi", apiKey: "" };
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

    containerEl.createEl("h2", { text: "AI Lexi 设置" });

    // Ollama 设置
    containerEl.createEl("h3", { text: "Ollama 配置" });

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    // 云端提供商配置（动态卡片）
    containerEl.createEl("h3", { text: "云端模型配置" });
    this.renderProviderCards(containerEl);

    // 通用设置
    containerEl.createEl("h3", { text: "通用配置" });

    new Setting(containerEl)
      .setClass("lexi-textarea-setting")
      .setName("系统提示词")
      .setDesc("AI 的系统提示词，定义 AI 的角色和行为")
      .addTextArea((text) =>
        text
          .setPlaceholder("你是一个有用的AI助手，请用中文回答。")
          .setValue(this.plugin.settings.systemPrompt)
          .onChange(async (value) => {
            this.plugin.settings.systemPrompt = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    new Setting(containerEl)
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

  /** 渲染云端提供商卡片列表 */
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
    const nameSpan = header.createSpan({ cls: "provider-card-name", text: p.name });
    if (p.supportsVision) {
      header.createSpan({ cls: "provider-card-vision", text: " 🖼️" });
    }
    const toggleBtn = header.createSpan({ cls: "provider-card-toggle", text: "▾" });
    const body = card.createDiv({ cls: "provider-card-body" });

    // 点击头部折叠/展开
    let expanded = false;
    header.addEventListener("click", () => {
      expanded = !expanded;
      body.style.display = expanded ? "block" : "none";
      toggleBtn.textContent = expanded ? "▴" : "▾";
    });
    body.style.display = "none";
    // 默认展开已启用的提供商
    if (isEnabled) {
      expanded = true;
      body.style.display = "block";
      toggleBtn.textContent = "▴";
    }

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
      .setName("模型名称")
      .setDesc(id === "doubao" ? "火山引擎推理接入点 ID（ep-xxxxxx），非模型名本身" : "要使用的模型名称")
      .addText((text) =>
        text
          .setPlaceholder(p.model)
          .setValue(p.model)
          .onChange(async (value) => {
            providers[id].model = value;
            await this.plugin.saveSettings();
          })
      );

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
          .setPlaceholder("4000")
          .setValue(String(p.maxTokens))
          .onChange(async (value) => {
            const num = parseInt(value, 10);
            if (!isNaN(num)) {
              providers[id].maxTokens = num;
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
