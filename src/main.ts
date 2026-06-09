import { Plugin, WorkspaceLeaf, TFile } from "obsidian";
import { OllamaChatView, VIEW_TYPE_OLLAMA_CHAT } from "./view";
import { OllamaChatSettingTab, DEFAULT_SETTINGS } from "./settings";
import { ConversationHistory } from "./history";
import { OllamaChatSettings, ProviderConfig } from "./types";

/**
 * 主插件类
 */
export default class OllamaChatPlugin extends Plugin {
  settings: OllamaChatSettings = DEFAULT_SETTINGS;
  private view: OllamaChatView | null = null;
  private claudeMdContent: string = "";
  conversationHistory: ConversationHistory | null = null;

  async onload(): Promise<void> {
    // 加载设置
    await this.loadSettings();

    // 初始化对话历史持久化（存放在插件数据目录）
    const basePath = `.obsidian/plugins/${this.manifest.id}`;
    this.conversationHistory = new ConversationHistory(`${basePath}/conversations.json`, this.app.vault);

    // 读取 CLAUDE.md
    await this.loadClaudeMd();

    // 注册视图
    this.registerView(VIEW_TYPE_OLLAMA_CHAT, (leaf) => {
      this.view = new OllamaChatView(leaf, this);
      return this.view;
    });

    // 添加打开侧边栏的命令
    this.addCommand({
      id: "open-ollama-chat",
      name: "打开 AI Lexi",
      callback: () => {
        this.activateView();
      },
    });

    // 添加设置标签页
    this.addSettingTab(new OllamaChatSettingTab(this.app, this));

    // 添加 Ribbon 图标
    this.addRibbonIcon("message-square", "AI Lexi", () => {
      this.activateView();
    });

    console.log("AI Lexi 插件已加载");
  }

  onunload(): void {
    console.log("AI Lexi 插件已卸载");
  }

  /**
   * 获取对话历史管理器（供 view 使用）
   */
  getConversationHistory(): ConversationHistory | null {
    return this.conversationHistory;
  }

  /**
   * 加载设置
   */
  async loadSettings(): Promise<void> {
    const saved = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);

    // 旧版本迁移：提供商从独立字段转为 providers 结构
    if (saved && "deepseekApiKey" in saved) {
      console.log("[AI Lexi] 检测到旧版设置格式，正在迁移提供商配置...");
      const providers = { ...this.settings.providers };
      if (providers.deepseek) {
        providers.deepseek = {
          ...providers.deepseek,
          apiKey: (saved as any).deepseekApiKey || "",
          baseUrl: (saved as any).deepseekBaseUrl || providers.deepseek.baseUrl,
          model: (saved as any).deepseekModel || providers.deepseek.model,
          temperature: (saved as any).deepseekTemperature ?? providers.deepseek.temperature,
          maxTokens: (saved as any).deepseekMaxTokens ?? providers.deepseek.maxTokens,
          enabled: !!((saved as any).deepseekApiKey),
        };
      }
      if (providers.xiaomi) {
        providers.xiaomi = {
          ...providers.xiaomi,
          apiKey: (saved as any).xiaomiApiKey || "",
          baseUrl: (saved as any).xiaomiBaseUrl || providers.xiaomi.baseUrl,
          model: (saved as any).xiaomiModel || providers.xiaomi.model,
          temperature: (saved as any).xiaomiTemperature ?? providers.xiaomi.temperature,
          maxTokens: (saved as any).xiaomiMaxTokens ?? providers.xiaomi.maxTokens,
          enabled: !!((saved as any).xiaomiApiKey),
        };
      }
      this.settings.providers = providers;
      // 清除旧字段
      const clean = { ...saved } as any;
      delete clean.deepseekApiKey; delete clean.deepseekBaseUrl; delete clean.deepseekModel;
      delete clean.deepseekTemperature; delete clean.deepseekMaxTokens;
      delete clean.xiaomiApiKey; delete clean.xiaomiBaseUrl; delete clean.xiaomiModel;
      delete clean.xiaomiTemperature; delete clean.xiaomiMaxTokens;
      await this.saveData({ ...this.settings });
      console.log("[AI Lexi] 提供商配置迁移完成");
    }

    // 检测旧系统提示词中的 tool_call 标签指令，自动升级
    // 旧提示词包含 "<tool_call>" 或 "使用 JSON 格式调用工具" 会干扰原生工具调用
    if (saved?.systemPrompt && (
      saved.systemPrompt.includes("<tool_call>") ||
      saved.systemPrompt.includes("使用 JSON 格式调用工具")
    )) {
      console.log("[AI Lexi] 检测到旧系统提示词，自动升级...");
      this.settings.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
      await this.saveData(this.settings);
    }

    // 自动升级小米 API 地址（旧版迁移）
    const xiaomiCfg = this.settings.providers?.xiaomi;
    if (xiaomiCfg && xiaomiCfg.baseUrl.includes("api.xiaomi.com")) {
      xiaomiCfg.baseUrl = "https://api.xiaomimimo.com/v1";
      await this.saveData(this.settings);
    }

    // 自动升级已知过时的模型名称
    const MODEL_UPGRADES: Record<string, Record<string, string>> = {
      glm: { "glm-4-plus": "glm-5.1", "glm-4": "glm-5.1" },
      kimi: { "kimi-latest": "kimi-for-coding" },
      deepseek: { "deepseek-coder": "deepseek-v4-flash", "deepseek-chat": "deepseek-v4-flash" },
    };
    let modelUpgraded = false;
    for (const [id, upgrades] of Object.entries(MODEL_UPGRADES)) {
      const provider = this.settings.providers?.[id];
      if (provider && upgrades[provider.model]) {
        console.log(`[AI Lexi] 升级 ${id} 模型: ${provider.model} → ${upgrades[provider.model]}`);
        provider.model = upgrades[provider.model];
        modelUpgraded = true;
      }
    }
    if (modelUpgraded) {
      await this.saveData(this.settings);
    }
  }

  /**
   * 保存设置
   */
  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // 更新视图
    if (this.view) {
      this.view.updateSettings(this.settings);
    }
  }

  /**
   * 读取 CLAUDE.md 文件
   */
  private async loadClaudeMd(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath("CLAUDE.md");
      if (file instanceof TFile) {
        this.claudeMdContent = await this.app.vault.read(file);
        console.log("已加载 CLAUDE.md");
      }
    } catch (err) {
      console.log("未找到 CLAUDE.md 文件");
    }
  }

  /**
   * 获取 CLAUDE.md 内容
   */
  getClaudeMd(): string {
    return this.claudeMdContent;
  }

  /**
   * 获取当前活动文件
   */
  getActiveFile(): TFile | null {
    return this.app.workspace.getActiveFile();
  }

  /**
   * 激活视图
   */
  async activateView(): Promise<void> {
    const { workspace } = this.app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_OLLAMA_CHAT);

    if (leaves.length > 0) {
      // 如果视图已存在，聚焦它
      leaf = leaves[0];
    } else {
      // 创建新的视图
      leaf = workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: VIEW_TYPE_OLLAMA_CHAT,
          active: true,
        });
      }
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
