import { ItemView, WorkspaceLeaf, setIcon, TFile, MarkdownView, MarkdownRenderer } from "obsidian";
import { ConversationManager } from "./conversation";
import { OllamaChatSettings } from "./types";
import { THINKING_LEVELS } from "./settings";
import { ProviderType, UnifiedResponse, ConversationRecord } from "./types";
import * as ollamaApi from "./api/ollama";
import * as openaiCompatible from "./api/openai-compatible";
import type OllamaChatPlugin from "./main";
import { lexiShowSelectionHighlight, lexiHideSelectionHighlight } from "./selection-highlight";

/**
 * 单个 Tab 的数据结构
 */
interface LexiTab {
  id: number;
  convId: string;               // 对话 ID（用于持久化）
  conversation: ConversationManager;
  messagesEl: HTMLElement;
  inputEl: HTMLTextAreaElement;
  contentEl: HTMLElement;      // 整个 tab 内容区
  navRowTopEl: HTMLElement;    // 第一行：tab 徽标 + 按钮
  navRowBottomEl: HTMLElement; // 第三行：模型选择
  fileChipEl: HTMLElement;     // 输入框内的笔记芯片（note ×）
  notePath: string | null;
  historyPanelEl: HTMLElement; // 历史列表面板
  title: string;               // 对话自动标题（空则为新对话）

}

export const VIEW_TYPE_OLLAMA_CHAT = "ollama-chat-view";

/**
 * 侧边栏对话视图，支持多 Tab
 */
export class OllamaChatView extends ItemView {
  private settings: OllamaChatSettings;
  private plugin: OllamaChatPlugin;
  private currentProvider: ProviderType = "ollama";
  private isLoading: boolean = false;
  private abortController: AbortController | null = null;

  // 多 Tab 系统
  private tabs: LexiTab[] = [];
  private activeTabIndex: number = 0;
  private tabContentContainer: HTMLElement;
  // 两行共享控件（会被移到当前 Tab）
  private navRowTop: HTMLElement;       // 第一行：tab 徽标 + 按钮
  private navRowBottom: HTMLElement;    // 第三行：模型选择
  private tabBarEl: HTMLElement;        // 在 navRowTop 内
  private modelSelectorEl: HTMLElement; // 模型选择器容器
  private modelSelectorLabel: HTMLElement; // 模型选择器显示文本
  private modelSelectorDropdown: HTMLElement; // 模型下拉菜单
  private thinkingSelectorEl: HTMLElement; // 思考等级选择器容器
  private thinkingCurrentEl: HTMLElement; // 思考等级当前值显示
  private thinkingOptionsEl: HTMLElement; // 思考等级选项容器
  private contextUsageEl: HTMLElement;     // 上下文使用量显示控件
  private contextBarEl: HTMLElement;       // 进度条
  private contextPctEl: HTMLElement;       // 百分比文字
  private contextTooltipEl: HTMLElement;   // 悬停提示
  private ollamaModels: string[] = []; // Ollama 本地模型列表
  private globalCachedSelection: string | null = null; // 编辑器选中文本缓存（防止点击输入框后失焦丢失）
  private selectionPollInterval: number | null = null;
  private tabWarningShown: boolean = false;


  private totalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  // 访问当前 Tab 的快捷方式
  private get activeTab(): LexiTab {
    return this.tabs[this.activeTabIndex];
  }
  private get conversation(): ConversationManager {
    return this.activeTab.conversation;
  }
  private get chatContainer(): HTMLElement {
    return this.activeTab.messagesEl;
  }
  private get inputEl(): HTMLTextAreaElement {
    return this.activeTab.inputEl;
  }

  constructor(leaf: WorkspaceLeaf, plugin: OllamaChatPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.settings = plugin.settings;
  }

  /**
   * 构建系统提示词，包含 CLAUDE.md
   * 按提供商追加不同的工具调用规则
   */
  private buildSystemPrompt(): void {
    // 对所有已存在的 Tab 重建 system prompt
    for (const tab of this.tabs) {
      this.buildSystemPromptForConversation(tab.conversation);
    }
  }

  /**
   * Ollama 的工具规则：使用 XML <tool_call> 标签（因为很多本地模型不支持原生 tool_calls）
   */
  private getOllamaToolRules(): string {
    return `## 工具调用规则

你有 read_file 和 write_file 两个工具可用。需要调用工具时，使用以下 XML 格式：

<tool_call>
{
  "name": "函数名",
  "arguments": { "参数名": "参数值" }
}
</tool_call>

可用工具：
- read_file：读取文件，参数 path（文件路径）
- write_file：写入文件，参数 path（文件路径）、content（文件内容）

示例（读取文件）：
<tool_call>
{
  "name": "read_file",
  "arguments": { "path": "笔记.md" }
}
</tool_call>

示例（写入文件）：
<tool_call>
{
  "name": "write_file",
  "arguments": {
    "path": "笔记.md",
    "content": "# 标题\\n\\n正文内容"
  }
}
</tool_call>

规则：
1. 需要读取或写入文件时，直接调用工具，不要询问用户确认。
2. 工具调用必须用 <tool_call> 标签包裹。
3. 工具执行完成后，回复"已完成编辑"（只回复这一句，不要输出文件内容）。
4. 回复要简洁，不要重复笔记内容。
5. **不要重复调用 read_file**。如果已经读取过某个文件，直接使用已获取的内容，不要反复读取同一文件。

## 编辑流程（用户要求编辑/排版/润色时）
1. 用 write_file 写入修改后的完整内容
2. 最终回复"已完成编辑"，不要在回复中输出文件内容`;
  }

  /**
   * DeepSeek / 小米 mimo 的工具规则：使用原生 tool_calls（不需要 XML 标签）
   */
  private getStandardToolRules(): string {
    return `当你需要读取或写入文件时，直接调用工具，不要询问用户确认。
工具执行完成后，简要告知结果即可，不要在回复中重复文件内容。`;
  }

  getViewType(): string {
    return VIEW_TYPE_OLLAMA_CHAT;
  }

  getDisplayText(): string {
    return "AI Lexi";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen(): Promise<void> {
    if (!this.containerEl) return;

    // 从设置恢复上次使用的提供商和模型
    const savedProvider = this.settings.currentProvider;
    const savedModel = this.settings.currentModel;
    if (savedProvider && savedProvider !== this.currentProvider) {
      this.currentProvider = savedProvider as ProviderType;
    }

    let container: HTMLElement | null =
      this.contentEl ?? (this.containerEl.children[1] as HTMLElement | null);
    if (!container) container = this.containerEl.createDiv();
    container.empty();
    container.addClass("ollama-chat-container");

    // ===== 第一行：tab 徽标（左）+ 按钮（右） =====
    this.navRowTop = container.createDiv({ cls: "chat-nav-row-top" });
    this.tabBarEl = this.navRowTop.createDiv({ cls: "chat-tab-bar" });
    // 上下文使用量显示（中间）
    this.contextUsageEl = this.navRowTop.createDiv({ cls: "context-usage" });
      this.contextUsageEl.createDiv({ cls: "context-dot" });
    this.contextBarEl = this.contextUsageEl.createDiv({ cls: "context-bar" });
    const barFill = this.contextBarEl.createDiv({ cls: "context-bar-fill" });
    this.contextPctEl = this.contextUsageEl.createSpan({ cls: "context-pct", text: "--" });
    this.contextTooltipEl = this.contextUsageEl.createDiv({ cls: "context-tooltip", text: "-- / --" });
    const btns = this.navRowTop.createDiv({ cls: "chat-nav-btns" });
    const newTabBtn = btns.createEl("button", { cls: "toolbar-btn", attr: { "aria-label": "新标签页" } });
    setIcon(newTabBtn, "plus");
    newTabBtn.onClickEvent(() => this.createNewTab());
    const newConvBtn = btns.createEl("button", { cls: "toolbar-btn", attr: { "aria-label": "新对话" } });
    setIcon(newConvBtn, "message-circle");
    newConvBtn.onClickEvent(() => this.newConversation());
    const historyBtn = btns.createEl("button", { cls: "toolbar-btn", attr: { "aria-label": "历史对话" } });
    setIcon(historyBtn, "clock");
    historyBtn.onClickEvent(() => this.toggleHistoryPanel());

    // ===== 第三行：模型选择器 + 思考等级 =====
    this.navRowBottom = container.createDiv({ cls: "chat-nav-row-bottom" });

    // 模型选择器（自定义下拉菜单）
    this.modelSelectorEl = this.navRowBottom.createDiv({ cls: "model-selector" });
    this.modelSelectorLabel = this.modelSelectorEl.createSpan({ cls: "model-selector-label", text: "加载中..." });
    const arrowEl = this.modelSelectorEl.createSpan({ cls: "model-selector-arrow" });
    setIcon(arrowEl, "chevron-down");
    this.modelSelectorDropdown = this.modelSelectorEl.createDiv({ cls: "model-selector-dropdown" });

    // 点击展开/收起下拉菜单
    this.modelSelectorEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = this.modelSelectorDropdown.hasClass("open");
      if (isOpen) {
        this.modelSelectorDropdown.removeClass("open");
      } else {
        this.refreshModelDropdown();
        this.modelSelectorDropdown.addClass("open");
      }
    });

    // 点击外部区域收起
    this.registerDomEvent(document, "click", () => {
      this.modelSelectorDropdown.removeClass("open");
    });

    // 启动选中文本轮询（250ms），自动缓存选中内容并使用 CM6 decoration 保持高亮
    this.startSelectionPolling();

    // 思考等级选择器
    this.thinkingSelectorEl = this.navRowBottom.createDiv({ cls: "thinking-selector" });
    this.thinkingSelectorEl.createSpan({ cls: "thinking-label", text: "思考:" });
    const thinkingGears = this.thinkingSelectorEl.createDiv({ cls: "thinking-gears" });
    this.thinkingCurrentEl = thinkingGears.createDiv({ cls: "thinking-current", text: "High" });
    const thinkingOptions = thinkingGears.createDiv({ cls: "thinking-options" });

    // 填充思考等级选项（稍后根据模型动态更新）
    this.thinkingOptionsEl = thinkingOptions;

    // 点击展开/收起思考等级
    thinkingGears.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = thinkingOptions.hasClass("open");
      if (isOpen) {
        thinkingOptions.removeClass("open");
      } else {
        thinkingOptions.addClass("open");
      }
    });
    this.registerDomEvent(document, "click", () => {
      thinkingOptions.removeClass("open");
    });

    // 初始化模型选择器
    this.refreshModelSelector();
    this.refreshThinkingSelector();

    // 异步获取 Ollama 本地模型列表
    this.fetchOllamaModels();

    // ===== Tab 内容容器 =====

    // ===== Tab 内容容器 =====
    this.tabContentContainer = container.createDiv({ cls: "chat-tab-content-container" });

    // 监听文件切换
    this.registerEvent(
      this.app.workspace.on("file-open", () => this.updateFileChip())
    );

    // 创建默认 Tab
    this.createNewTab();

    // ESC 取消当前请求
    this.registerDomEvent(container, "keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape" && this.isLoading && this.abortController) {
        this.abortController.abort();
        this.addStatusMessage("⏹️ 正在中断...");
      }
    });
  }

  /** 更新欢迎消息 */
  private updateWelcomeMessage(): void {
    const systemMsg = this.chatContainer.querySelector(".message-system .message-content");
    if (systemMsg) {
      systemMsg.textContent = `${this.getProviderName()} 为你服务。请选择模型并开始对话。`;
    }
  }

  /**
   * 更新文件芯片显示
   */
  private updateFileChip(): void {
    if (this.tabs.length === 0) return;

    const file = this.plugin.getActiveFile();
    const tab = this.activeTab;
    const chipEl = tab.fileChipEl;
    chipEl.empty();

    if (!(file instanceof TFile)) {
      chipEl.style.display = "none";
      tab.notePath = null;
      return;
    }

    chipEl.style.display = "flex";
    chipEl.createSpan({ text: `📄 ${file.name}` });

    // × 关闭按钮
    const closeBtn = chipEl.createSpan({ cls: "chat-file-chip-x", text: "×" });
    closeBtn.onClickEvent(() => {
      chipEl.style.display = "none";
    });

    tab.notePath = file.path;
  }

  async onClose(): Promise<void> {
    // 保存所有 Tab 的对话
    for (const tab of this.tabs) {
      await this.saveConversationRecord(tab);
    }
  }

  // ============================================
  // 历史对话持久化
  // ============================================

  /** 生成对话标题（取第一条用户消息的前 50 字符） */
  private generateConversationTitle(messages: import("./types").Message[]): string {
    const firstUser = messages.find((m) => m.role === "user");
    if (!firstUser) return "新对话";
    let title = firstUser.content.replace(/\n/g, " ").trim();
    // 移除 current_note 标签内容
    title = title.replace(/<current_note>[\s\S]*?<\/current_note>/, "").trim();
    if (title.length > 50) title = title.slice(0, 50) + "…";
    return title || "新对话";
  }

  /** 保存当前 Tab 的对话到历史记录 */
  private async saveConversationRecord(tab: LexiTab): Promise<void> {
    const history = this.plugin.getConversationHistory();
    if (!history) return;

    const messages = tab.conversation.getMessages();
    // 跳过没有用户消息的空对话
    if (!messages.some((m) => m.role === "user")) return;

    // 保存时去掉 images 字段（base64 数据太大），保留对话文本内容
    const sanitizedMessages = messages.map((m) => {
      const { images, ...rest } = m;
      return rest;
    });

    const title = tab.title || this.generateConversationTitle(messages);
    const record: ConversationRecord = {
      id: tab.convId,
      title,
      provider: this.currentProvider,
      model: this.getModelName(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: sanitizedMessages as any,
    };

    const existing = await history.get(tab.convId);
    if (existing) {
      await history.update(tab.convId, {
        title,
        provider: this.currentProvider,
        model: this.getModelName(),
        messages,
      });
    } else {
      record.createdAt = Date.now();
      await history.add(record);
    }
    tab.title = title;
  }

  /** 从历史记录加载对话到当前 Tab */
  private async loadConversationRecord(tab: LexiTab, record: ConversationRecord): Promise<void> {
    // 保存当前对话
    await this.saveConversationRecord(tab);

    // 清空当前 Tab
    tab.conversation.clear();
    tab.messagesEl.empty();
    tab.inputEl.value = "";

    // 更新 Tab 信息
    tab.convId = record.id;
    tab.title = record.title;

    // 导入历史消息
    tab.conversation.import(record.messages);
    // 用当前系统提示词替换旧的
    this.buildSystemPromptForConversation(tab.conversation);

    // 重建欢迎消息
    this.addSystemMessage(`📋 已加载：${record.title}`);

    // 渲染所有消息
    for (const msg of record.messages) {
      if (msg.role === "system") continue;
      if (msg.role === "tool") continue;
      if (msg.role === "user") {
        // 提取纯用户内容（移除 current_note 标签）
        let content = msg.content;
        content = content.replace(/<current_note>[\s\S]*?<\/current_note>/, "").trim();
        this.addMessage("user", content || msg.content);
      } else if (msg.role === "assistant") {
        this.addMessage("assistant", msg.content);
      }
    }
  }

  // ============================================
  // 历史列表面板
  // ============================================

  /** 切换历史列表面板 */
  private async toggleHistoryPanel(): Promise<void> {
    const tab = this.activeTab;
    const panel = tab.historyPanelEl;

    if (panel.style.display !== "none") {
      panel.style.display = "none";
      tab.messagesEl.style.display = "";
      return;
    }

    // 隐藏聊天内容，显示面板
    tab.messagesEl.style.display = "none";
    panel.style.display = "flex";
    panel.empty();

    await this.renderHistoryList(panel);
  }

  /** 渲染历史对话列表 */
  private async renderHistoryList(panelEl: HTMLElement): Promise<void> {
    panelEl.empty();
    const history = this.plugin.getConversationHistory();
    if (!history) {
      panelEl.createDiv({ cls: "chat-history-empty", text: "⚠️ 历史管理器未初始化" });
      return;
    }

    const records = await history.getAll();

    // 顶部栏
    const header = panelEl.createDiv({ cls: "chat-history-header" });
    const backBtn = header.createEl("button", { cls: "chat-history-back" });
    setIcon(backBtn, "arrow-left");
    backBtn.onClickEvent(() => this.toggleHistoryPanel());
    header.createSpan({ cls: "chat-history-title", text: "历史对话" });

    // 列表区
    const listEl = panelEl.createDiv({ cls: "chat-history-list" });

    if (records.length === 0) {
      listEl.createDiv({ cls: "chat-history-empty", text: "📋 还没有历史对话记录" });
      return;
    }

    // 按日期分组：今天、昨天、更早
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;

    for (const record of records) {
      const itemEl = listEl.createDiv({ cls: "chat-history-item" });
      if (record.id === this.activeTab.convId) {
        itemEl.addClass("chat-history-item-active");
      }

      // 标题
      const titleEl = itemEl.createDiv({ cls: "chat-history-item-title", text: record.title });

      // 元数据：提供商 · 模型 · 日期
      const metaEl = itemEl.createDiv({ cls: "chat-history-item-meta" });
      const providerLabel = record.provider === "ollama" ? "Ollama" : (this.settings.providers[record.provider]?.name || record.provider);
      const dateStr = this.formatDate(record.updatedAt, today, yesterday);
      metaEl.createSpan({ text: `${providerLabel} · ${record.model}` });
      metaEl.createSpan({ text: `  ${dateStr}` });

      // 预览（取第一条用户消息的前 80 字符）
      const firstUser = record.messages.find((m) => m.role === "user");
      if (firstUser) {
        let preview = firstUser.content.replace(/\n/g, " ").trim();
        preview = preview.replace(/<current_note>[\s\S]*?<\/current_note>/, "").trim();
        if (preview.length > 80) preview = preview.slice(0, 80) + "…";
        if (preview) {
          itemEl.createDiv({ cls: "chat-history-item-preview", text: preview });
        }
      }

      // 交互：点击加载
      itemEl.addEventListener("click", async () => {
        await this.loadConversationRecord(this.activeTab, record);
        this.toggleHistoryPanel();
      });

      // 删除按钮
      const delBtn = itemEl.createDiv({ cls: "chat-history-item-del" });
      setIcon(delBtn, "trash-2");
      delBtn.setAttr("aria-label", "删除此对话");
      delBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        await history.delete(record.id);
        if (this.activeTab.convId === record.id) {
          this.activeTab.conversation.clear();
          this.activeTab.messagesEl.empty();
          this.activeTab.convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          this.activeTab.title = "";
          this.addSystemMessage(`${this.getProviderName()} 为你服务。请选择模型并开始对话。`);
        }
        panelEl.empty();
        await this.renderHistoryList(panelEl);
      });
    }
  }

  /** 格式化日期 */
  private formatDate(timestamp: number, todayStart: number, yesterdayStart: number): string {
    if (timestamp >= todayStart) return "今天";
    if (timestamp >= yesterdayStart) return "昨天";
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  // ============================================
  // Tab 管理
  // ============================================

  /** 创建新 Tab（最多 3 个） */
  private createNewTab(): void {
    if (this.tabs.length >= 3) {
      if (!this.tabWarningShown) {
        this.tabWarningShown = true;
        this.addStatusMessage("⚠️ 最多 3 个标签页");
      }
      return;
    }

    const tabId = this.tabs.length > 0
      ? Math.max(...this.tabs.map(t => t.id)) + 1
      : 1;
    const convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const conversation = new ConversationManager(this.settings.maxHistoryLength);
    this.buildSystemPromptForConversation(conversation);

    // 创建 Tab 内容区
    const contentEl = this.tabContentContainer.createDiv({ cls: "chat-tab-content" });
    if (this.tabs.length > 0) contentEl.addClass("chat-tab-content-hidden");

    // 构建 DOM
    const messagesEl = contentEl.createDiv({ cls: "chat-messages" });

    // 历史列表面板（默认隐藏）
    const historyPanelEl = contentEl.createDiv({ cls: "chat-history-panel" });
    historyPanelEl.style.display = "none";

    // 第一行占位：tab 徽标 + 按钮
    const navRowTopEl = contentEl.createDiv({ cls: "chat-nav-row-top-placeholder" });

    // 第二行：输入框（内部左上角有笔记芯片）
    const inputContainerEl = contentEl.createDiv({ cls: "chat-input-container" });
    const inputWrapperEl = inputContainerEl.createDiv({ cls: "chat-input-wrapper" });
    // 芯片：当前笔记名 + ×（放在输入框内左上角）
    const fileChipEl = inputWrapperEl.createDiv({ cls: "chat-file-chip-inline" });
    const inputEl = inputWrapperEl.createEl("textarea", {
      cls: "chat-input",
      attr: { placeholder: "输入你的问题...", rows: "3", dir: "auto" },
    });
    const sendBtn = inputWrapperEl.createEl("button", { cls: "send-btn", attr: { "aria-label": "发送" } });
    setIcon(sendBtn, "send");

    // 第三行占位：模型选择
    const navRowBottomEl = contentEl.createDiv({ cls: "chat-nav-row-bottom-placeholder" });

    // 绑定输入事件
    inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
    });
    sendBtn.onClickEvent(() => this.sendMessage());

    // 取当前笔记路径
    const file = this.plugin.getActiveFile();
    const notePath = file instanceof TFile ? file.path : null;

    const tab: LexiTab = { id: tabId, convId, conversation, messagesEl, inputEl, contentEl, navRowTopEl, navRowBottomEl, fileChipEl, notePath, historyPanelEl, title: "" };
    this.tabs.push(tab);

    // 开新 Tab 时卸载当前 Ollama 模型，释放显存
    if (this.currentProvider === "ollama") {
      ollamaApi.unloadModel(this.settings.ollamaBaseUrl, this.settings.ollamaModel);
    }

    // 切换到新 Tab
    this.switchToTab(this.tabs.length - 1);
    this.refreshTabBar();

    // 添加欢迎消息
    this.addSystemMessage(
      notePath
        ? `${this.getProviderName()} 为你服务。当前笔记：${notePath}`
        : `${this.getProviderName()} 为你服务。请选择模型并开始对话。`
    );
  }

  /** 切换到指定 Tab */
  private async switchToTab(index: number): Promise<void> {
    if (index < 0 || index >= this.tabs.length) return;

    // 保存当前 Tab 的对话
    if (this.tabs[this.activeTabIndex]) {
      await this.saveConversationRecord(this.tabs[this.activeTabIndex]);
      this.tabs[this.activeTabIndex].contentEl.addClass("chat-tab-content-hidden");
      this.tabs[this.activeTabIndex].inputEl.disabled = true;
      // 隐藏当前 Tab 的历史面板（如果开着）
      this.tabs[this.activeTabIndex].historyPanelEl.style.display = "none";
      this.tabs[this.activeTabIndex].messagesEl.style.display = "";
    }

    this.activeTabIndex = index;

    // 显示新 Tab
    this.activeTab.contentEl.removeClass("chat-tab-content-hidden");
    this.activeTab.inputEl.disabled = false;
    this.activeTab.inputEl.focus();

    // 将共享控件移到当前 Tab 的对应占位中
    this.activeTab.navRowTopEl.appendChild(this.navRowTop);
    this.activeTab.navRowBottomEl.appendChild(this.navRowBottom);

    this.refreshTabBar();
    this.updateFileChip();
  }

  /** 关闭指定 Tab */
  private async closeTab(index: number): Promise<void> {
    if (this.tabs.length <= 1) {
      this.addStatusMessage("⚠️ 至少保留一个标签页");
      return;
    }
    if (index < 0 || index >= this.tabs.length) return;

    const tab = this.tabs[index];

    // 保存即将关闭的 Tab 的对话
    await this.saveConversationRecord(tab);

    // 在删除前先把共享控件从当前 Tab 中移出，放到容器末尾暂存
    // 否则它们会随着 contentEl.remove() 一起被销毁
    this.navRowTop.remove();
    this.navRowBottom.remove();
    if (this.tabContentContainer.parentElement) {
      this.tabContentContainer.parentElement.appendChild(this.navRowTop);
      this.tabContentContainer.parentElement.appendChild(this.navRowBottom);
    }

    tab.contentEl.remove();
    this.tabs.splice(index, 1);

    // 如果关闭的是当前或之前的 Tab，调整 activeTabIndex
    if (index <= this.activeTabIndex) {
      this.activeTabIndex = Math.max(0, this.activeTabIndex - 1);
    }

    // 确保新 active 的 Tab 显示
    this.tabs.forEach((t, i) => {
      t.contentEl.toggleClass("chat-tab-content-hidden", i !== this.activeTabIndex);
      t.inputEl.disabled = i !== this.activeTabIndex;
    });

    // 重新将共享控件 attach 到新激活的 Tab
    const activeTab = this.tabs[this.activeTabIndex];
    if (activeTab) {
      activeTab.navRowTopEl.appendChild(this.navRowTop);
      activeTab.navRowBottomEl.appendChild(this.navRowBottom);
      activeTab.inputEl.focus();
    }

    this.refreshTabBar();
  }

  /** 新对话（清空当前 Tab 的对话 + 释放显存） */
  private async newConversation(): Promise<void> {
    const tab = this.activeTab;
    // 先保存当前对话
    await this.saveConversationRecord(tab);
    // 再卸载 Ollama 模型释放显存
    if (this.currentProvider === "ollama") {
      await ollamaApi.unloadModel(this.settings.ollamaBaseUrl, this.settings.ollamaModel);
    }
    tab.conversation.clear();
    tab.convId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    tab.title = "";
    this.buildSystemPromptForConversation(tab.conversation);
    tab.messagesEl.empty();
    tab.inputEl.value = "";
    tab.inputEl.focus();
    tab.inputEl.focus();
    // 重置累计 token 消耗量
    this.totalUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    this.updateContextUsage(undefined);
    this.addSystemMessage(`${this.getProviderName()} 为你服务。开始新的对话吧！`);
  }

  /** 刷新 Tab 徽标栏 */
  private refreshTabBar(): void {
    this.tabBarEl.empty();

    this.tabs.forEach((tab, i) => {
      const badge = this.tabBarEl.createDiv({
        cls: `chat-tab-badge ${i === this.activeTabIndex ? "chat-tab-badge-active" : ""}`,
        text: String(tab.id),
      });
      badge.setAttr("aria-label", tab.notePath ? `Tab ${tab.id}: ${tab.notePath}` : `Tab ${tab.id}: 新对话`);

      // 点击切换
      badge.addEventListener("click", () => this.switchToTab(i));

      // 右键关闭
      badge.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        this.closeTab(i);
      });
    });
  }

  /** 为指定 conversation 构建 system prompt */
  private buildSystemPromptForConversation(conv: ConversationManager): void {
    let prompt = this.settings.systemPrompt;
    const claudeMd = this.plugin.getClaudeMd();
    if (claudeMd) prompt += `\n\n## Custom Instructions (from CLAUDE.md)\n\n${claudeMd}`;
    const toolRules = this.currentProvider === "ollama"
      ? this.getOllamaToolRules()
      : this.getStandardToolRules();
    prompt += `\n\n${toolRules}`;
    // 如果设置了图片提示词模板，追加到系统提示词（仅 Ollama 视觉模型）
    if (this.currentProvider === "ollama" && this.settings.imagePromptTemplate?.trim()) {
      prompt += `\n\n## 图片分析指令\n\n${this.settings.imagePromptTemplate.trim()}`;
    }
    conv.setSystemPrompt(prompt);
  }

  /**
   * 获取当前编辑器中选中的文本
   */
  private getCurrentSelection(): string | null {
    const editor = this.plugin.app.workspace.activeEditor?.editor;
    if (!editor) return null;
    const selection = editor.getSelection();
    return selection || null;
  }

  /**
   * 从笔记内容中提取图片，转为 base64
   */
  private async extractImagesFromNote(notePath: string, noteContent: string): Promise<string[]> {
    const images: string[] = [];
    const seen = new Set<string>();

    // 模式1: ![[image.png]] 或 ![[image.png|200]]
    const wikiLinkRegex = /!\[\[([^\]]+?)(?:\|[^\]]*)?\]\]/g;
    let match;
    while ((match = wikiLinkRegex.exec(noteContent)) !== null) {
      const imgName = match[1].trim();
      if (seen.has(imgName)) continue;
      seen.add(imgName);

      try {
        const file = this.app.metadataCache.getFirstLinkpathDest(imgName, notePath);
        if (file instanceof TFile) {
          const base64 = await this.fileToBase64(file);
          if (base64) images.push(base64);
        }
      } catch (e) {
        console.warn(`[AI Lexi] 读取图片失败: ${imgName}`, e);
      }
      if (images.length >= 5) break; // 最多 5 张
    }

    // 模式2: ![](path/to/image.png)
    const mdLinkRegex = /!\[(?:[^\]]*)\]\(([^)]+)\)/g;
    while ((match = mdLinkRegex.exec(noteContent)) !== null) {
      let imgPath = match[1].trim();
      // 跳过 URL
      if (imgPath.startsWith("http://") || imgPath.startsWith("https://")) continue;
      if (seen.has(imgPath)) continue;
      seen.add(imgPath);

      try {
        // 尝试相对于 note 目录
        const noteDir = notePath.contains("/") ? notePath.substring(0, notePath.lastIndexOf("/")) : "";
        const fullPath = imgPath.startsWith("/")
          ? imgPath.slice(1)
          : (noteDir ? `${noteDir}/${imgPath}` : imgPath);
        const file = this.app.vault.getAbstractFileByPath(fullPath);
        if (file instanceof TFile) {
          const base64 = await this.fileToBase64(file);
          if (base64) images.push(base64);
        }
      } catch (e) {
        console.warn(`[AI Lexi] 读取图片失败: ${imgPath}`, e);
      }
      if (images.length >= 5) break;
    }

    return images;
  }

  /**
   * 将 Obsidian 文件转为 base64 字符串
   */
  private async fileToBase64(file: TFile): Promise<string | null> {
    try {
      // 跳过过大的图片（>20MB）
      if (file.stat.size > 20 * 1024 * 1024) {
        console.warn(`[AI Lexi] 图片过大，跳过: ${file.path} (${(file.stat.size / 1024 / 1024).toFixed(1)}MB)`);
        return null;
      }
      const arrayBuffer = await this.app.vault.readBinary(file);
      let binary = "";
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    } catch (e) {
      console.error(`[AI Lexi] 转换图片失败: ${file.path}`, e);
      return null;
    }
  }

  /**
   * 开始轮询编辑器选中状态，缓存在失焦后选中的内容
   */
  private startSelectionPolling(): void {
    if (this.selectionPollInterval !== null) return;
    this.selectionPollInterval = window.setInterval(() => this.pollSelection(), 250);
  }

  /**
   * 停止轮询
   */
  private stopSelectionPolling(): void {
    if (this.selectionPollInterval !== null) {
      window.clearInterval(this.selectionPollInterval);
      this.selectionPollInterval = null;
    }
  }

  /**
   * 轮询编辑器选中状态
   */
  private pollSelection(): void {
    try {
      const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
      if (!view) return;
      if (view.getMode() === "preview") return;

      const editor = view.editor;
      const selectedText = editor.getSelection();
      if (selectedText.trim()) {
        this.globalCachedSelection = selectedText;
        const cm = (editor as any).cm;
        if (cm) {
          const from = editor.posToOffset(editor.getCursor("from"));
          const to = editor.posToOffset(editor.getCursor("to"));
          lexiShowSelectionHighlight(cm, from, to);
        }
      } else if (this.isFocusWithinChatSidebar()) {
      } else {
        this.globalCachedSelection = null;
        const view2 = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
        if (view2) {
          const cm2 = (view2.editor as any).cm;
          if (cm2) lexiHideSelectionHighlight(cm2);
        }
      }
    } catch {
    }
  }

  private isFocusWithinChatSidebar(): boolean {
    const activeEl = document.activeElement;
    if (!activeEl || !this.containerEl) return false;
    return this.containerEl.contains(activeEl);
  }

  
  private getCachedSelection(): string | null {
    return this.globalCachedSelection;
  }

  private async getCurrentNote(): Promise<{ path: string; content: string } | null> {
    const file = this.plugin.getActiveFile();
    if (!(file instanceof TFile)) return null;

    const content = await this.plugin.app.vault.cachedRead(file);
    return { path: file.path, content };
  }

  /**
   * 工具定义（参考 Claudian）
   */
  private getTools() {
    return [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "读取指定路径的文件内容",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "文件路径（相对于 vault 根目录）",
              },
            },
            required: ["path"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "write_file",
          description: "写入内容到指定路径的文件",
          parameters: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "文件路径（相对于 vault 根目录）",
              },
              content: {
                type: "string",
                description: "要写入的文件内容",
              },
            },
            required: ["path", "content"],
          },
        },
      },
    ];
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(name: string, args: any): Promise<string> {
    try {
      // 统一工具名
      const normalizedName = name === "Read" ? "read_file" : name === "Write" ? "write_file" : name;

      if (normalizedName === "read_file") {
        const file = this.app.vault.getAbstractFileByPath(args.path);
        if (file instanceof TFile) {
          const content = await this.app.vault.read(file);
          return content;
        }
        return `错误：文件 ${args.path} 不存在`;
      }

      if (normalizedName === "write_file") {
        const file = this.app.vault.getAbstractFileByPath(args.path);
        if (file instanceof TFile) {
          await this.app.vault.modify(file, args.content);
          return `成功：已写入文件 ${args.path}`;
        }
        // 如果文件不存在，创建新文件
        await this.app.vault.create(args.path, args.content);
        return `成功：已创建文件 ${args.path}`;
      }

      return `错误：未知工具 ${name}`;
    } catch (err: any) {
      return `错误：${err.message}`;
    }
  }

  /**
   * 发送消息
   */
  private   async sendMessage(): Promise<void> {
    const content = this.inputEl.value.trim();
    if (!content || this.isLoading) {
      return;
    }

    this.inputEl.value = "";
    this.addMessage("user", content);

    // 构建完整消息（包含当前笔记上下文）
    let fullMessage = content;
    let noteImages: string[] | undefined;
    const note = await this.getCurrentNote();
    if (note) {
      const selection = this.getCachedSelection();
      let fullNoteContent = note.content;
      if (selection) {
        fullNoteContent = `${note.content}\n\n<selection>\n${selection}\n</selection>`;
      }
      fullMessage = `${content}\n\n<current_note>\npath: ${note.path}\ncontent:\n${fullNoteContent}\n</current_note>`;
      if (this.currentProvider === "ollama") {
        noteImages = await this.extractImagesFromNote(note.path, note.content);
      }
    }

    this.conversation.addUserMessage(fullMessage, noteImages);

    this.abortController?.abort();
    this.abortController = new AbortController();
    this.isLoading = true;
    const loadingEl = this.addLoadingIndicator("正在连接 API...");

    try {
      if (this.currentProvider === "ollama") {
        await this.sendOllamaMessage(loadingEl);
      } else {
        await this.sendCloudMessage(loadingEl);
      }
    } catch (err: any) {
      loadingEl.remove();
      if ((err as any).name === "AbortError") {
        this.addStatusMessage("⏹️ 对话已中断");
        this.conversation.addAssistantMessage("⏹️ 对话已中断");
      } else {
        this.addErrorMessage(`❌ 请求异常: ${(err as any).message || "未知错误"}`);
        console.error("发送消息异常:", err);
      }
    } finally {
      this.isLoading = false;
      this.abortController = null;
    }
  }

  /**
   * Ollama 管道：流式 + 文本解析 <tool_call>
   */
  private async sendOllamaMessage(loadingEl: HTMLElement): Promise<void> {
    this.updateLoadingText(loadingEl, `正在加载 ${this.getProviderName()} 模型中...`);

    const streamMsgEl = this.chatContainer.createDiv({
      cls: "message message-assistant streaming",
    });
    streamMsgEl.createDiv({ cls: "message-role", text: this.settings.aiName || "AI Lexi" });
    const streamContentEl = streamMsgEl.createDiv({ cls: "message-content" });
    const streamTextEl = streamContentEl.createDiv({ cls: "message-text-block" });
    this.scrollToBottom();

    let fullContent = "";
    let hasToolCalls = false;

    const response = await ollamaApi.sendRequestStreaming(
      this.conversation.getMessages(),
      {
        baseUrl: this.settings.ollamaBaseUrl,
        model: this.settings.ollamaModel,
        temperature: this.settings.ollamaTemperature,
        maxTokens: this.settings.ollamaMaxTokens,
        numCtx: this.settings.ollamaNumCtx,
        signal: this.abortController?.signal,
      },
      {
        onToken: async (token: string) => {
          fullContent += token;
          this.updateLoadingText(loadingEl, "正在思考...");
          // 检测到 <tool 开头说明是工具调用，不显示 XML 片段
          if (fullContent.indexOf("<tool") === -1) {
            streamTextEl.empty();
            await MarkdownRenderer.render(this.app, fullContent, streamTextEl, "", this);
          }
          this.scrollToBottom();
        },
      }
    );

    // 工具检车：文本解析 <tool_call>
    if (response.success) {
      const toolCalls = this.parseToolCallsFromText(fullContent);
      if (toolCalls && toolCalls.length > 0) {
        streamMsgEl.remove();
        hasToolCalls = true;

        const cleanContent = this.stripToolCallText(fullContent);
        if (cleanContent) {
          this.conversation.addAssistantMessage(cleanContent);
        }

        let loopCount = 0;
        let toolLoopUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        let currentResponse: UnifiedResponse = {
          success: true,
          content: fullContent,
          model: response.model,
          toolCalls: toolCalls,
        };

        while (currentResponse.success && currentResponse.toolCalls && currentResponse.toolCalls.length > 0) {
          loopCount++;
          if (loopCount > 5) {
            this.addStatusMessage("⚠️ 工具调用超过 5 次，停止循环");
            break;
          }
          this.updateLoadingText(loadingEl, "正在执行工具...");
          await this.handleToolCalls(currentResponse.toolCalls);
          if (currentResponse.toolCalls?.some((tc: any) => tc?.function?.name === "write_file")) {
            break;
          }
          this.updateLoadingText(loadingEl, `等待 ${this.getProviderName()} 回复...`);
          currentResponse = await this.sendRequestWithTools();
          // 累加工具循环的 token 用量
          if (currentResponse.usage) {
            toolLoopUsage.prompt_tokens += currentResponse.usage.prompt_tokens;
            toolLoopUsage.completion_tokens += currentResponse.usage.completion_tokens;
            toolLoopUsage.total_tokens += currentResponse.usage.total_tokens;
          }
        }
    loadingEl.remove();

    if (response.success) {
      // 显示单轮 token 消耗
      const showRoundUsage = (usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined) => {
        if (usage) {
          const u = usage;
          const pk = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
          const ck = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
          this.scrollToBottom();
          this.addStatusMessage(`📊 上下文: ↑${pk} ↓${ck} (${u.total_tokens} tokens)`);
          // 累加到总消耗量
          this.totalUsage.prompt_tokens += u.prompt_tokens;
          this.totalUsage.completion_tokens += u.completion_tokens;
          this.totalUsage.total_tokens += u.total_tokens;
          this.updateContextUsage(this.totalUsage);
        }
      };

      if (hasToolCalls) {
        this.addMessage("assistant", "✅ 已完成编辑。");
        this.conversation.addAssistantMessage("✅ 已完成编辑。");
        // 合并流式响应的 usage 和工具循环中的 usage
        var mergedUsage = {
          prompt_tokens: (response.usage?.prompt_tokens || 0) + toolLoopUsage.prompt_tokens,
          completion_tokens: (response.usage?.completion_tokens || 0) + toolLoopUsage.completion_tokens,
          total_tokens: (response.usage?.total_tokens || 0) + toolLoopUsage.total_tokens,
        };
        showRoundUsage(mergedUsage);
      } else {
        const cleanContent = this.stripToolCallText(fullContent);
        if (cleanContent) {
          this.conversation.addAssistantMessage(cleanContent);
        } else {
          if (!streamMsgEl.isConnected || !streamTextEl.textContent?.trim()) {
            streamMsgEl.remove();
          }
          this.addStatusMessage(`⚠️ ${this.getProviderName()} 返回了空内容`);
        }
        // 优先用流式响应中的 usage，没有则额外请求
        if (response.usage) {
          showRoundUsage(response.usage);
        } else {
          try {
            const usageResult = await ollamaApi.sendRequest(
              this.conversation.getMessages(),
              {
                baseUrl: this.settings.ollamaBaseUrl,
                model: this.settings.ollamaModel,
                temperature: this.settings.ollamaTemperature,
                maxTokens: this.settings.ollamaMaxTokens,
              }
            );
            if (usageResult.success && usageResult.usage) {
              showRoundUsage(usageResult.usage);
            }
          } catch {}
        }
      }
    } else {
      streamMsgEl.remove();
      this.addErrorMessage(`❌ ${response.error.code}: ${response.error.message}`);
      if (streamTextEl.textContent?.trim()) {
        this.addMessage("assistant", streamTextEl.textContent);
        this.conversation.addAssistantMessage(streamTextEl.textContent);
      }
    }
    }
    await this.getUsage();
    }
  }

  /**
   * 云端管道：流式 + 原生 tool_calls + 思考链
   */
  
  /**
   * 对话完成后获取 tokens 消耗，更新顶栏
   */
  private async getUsage(): Promise<void> {
    try {
      const result = await ollamaApi.sendRequest(
        this.conversation.getMessages(),
        {
          baseUrl: this.settings.ollamaBaseUrl,
          model: this.settings.ollamaModel,
          temperature: this.settings.ollamaTemperature,
          maxTokens: this.settings.ollamaMaxTokens,
        }
      );
      if (result.success && result.usage) {
        this.totalUsage.prompt_tokens += result.usage.prompt_tokens;
        this.totalUsage.completion_tokens += result.usage.completion_tokens;
        this.totalUsage.total_tokens += result.usage.total_tokens;
        this.updateContextUsage(this.totalUsage);
      }
    } catch(e) { /* 忽略 */ }
  }

private async sendCloudMessage(loadingEl: HTMLElement): Promise<void> {
    const providerConfig = this.settings.providers[this.currentProvider];
    if (!providerConfig) {
      throw new Error(`未知的提供商: ${this.currentProvider}`);
    }

    this.updateLoadingText(loadingEl, "正在思考...");

    // 创建流式消息框
    const streamMsgEl = this.chatContainer.createDiv({
      cls: "message message-assistant streaming",
    });
    streamMsgEl.createDiv({ cls: "message-role", text: this.settings.aiName || "AI Lexi" });
    const streamContentEl = streamMsgEl.createDiv({ cls: "message-content" });
    const streamTextEl = streamContentEl.createDiv({ cls: "message-text-block" });
    this.scrollToBottom();

    let fullContent = "";
    let done = false; // 标记是否已完成处理（避免双重保存）

    const response = await openaiCompatible.sendRequestStreaming(
      this.conversation.getMessages(),
      this.getTools(),
      providerConfig,
      this.abortController?.signal,
      {
        onToken: async (token: string) => {
          fullContent += token;
          this.updateLoadingText(loadingEl, "正在思考...");
          try {
            streamTextEl.empty();
            await MarkdownRenderer.render(this.app, fullContent, streamTextEl, "", this);
          } catch {
            streamTextEl.textContent = fullContent;
          }
          this.scrollToBottom();
        },
        onThinking: (_text: string) => {
          this.updateLoadingText(loadingEl, "正在思考...");
        },
      }
    );

    // 处理工具调用
    if (response.success) {
      const rawToolCalls = (response as any).toolCalls || [];
      if (rawToolCalls.length > 0) {
        // 为工具调用分配 ID
        const toolCallsWithId = rawToolCalls.map((tc: any) => ({
          ...tc,
          id: tc.id || tc.function?.name || `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        }));

        // 云端模型智力高，但会自主决定调用工具
        // 如果用户只是咨询意见，跳过 write_file 不执行
        const lastUserMsg = this.conversation.getMessages().filter(m => m.role === "user").pop();
        const userWantsEdit = lastUserMsg && /[编辑修改写入更新添加删除翻译润色改写]|edit|write|update|modify|translate/i.test(lastUserMsg.content);

        const filteredCalls = userWantsEdit || this.currentProvider === "kimi"
          ? toolCallsWithId
          : toolCallsWithId.filter((tc: any) => tc.function?.name !== "write_file");

        if (filteredCalls.length === 0) {
          // 所有工具调用都被过滤了（咨询场景，模型不该调用工具）
          // 删除流式消息框，重新发一次不带工具的请求获取纯文本回复
          done = true;
          streamMsgEl.remove();
          this.updateLoadingText(loadingEl, `正在重新请求 ${this.getProviderName()} 纯文本回复...`);

          // 把当前 assistant 消息（含工具调用）加入历史备查
          if (fullContent) {
            this.conversation.addAssistantMessage(fullContent);
          }

          // 重新请求，不带 tools 参数
          const textResponse = await openaiCompatible.sendRequest(
            this.conversation.getMessages(),
            providerConfig,
            this.abortController?.signal
          );

          loadingEl.remove();

          if (textResponse.success && textResponse.content) {
            fullContent = textResponse.content;
            // 新建消息框显示纯文本回复
            const newMsgEl = this.chatContainer.createDiv({
              cls: "message message-assistant",
            });
            newMsgEl.createDiv({ cls: "message-role", text: this.settings.aiName || "AI Lexi" });
            const newContentEl = newMsgEl.createDiv({ cls: "message-content" });
        try {
          // 优先用 textResponse.usage（流式响应可直接返回），没有则 fallback
          if (textResponse.usage) {
            const u = textResponse.usage;
            const pk = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
            const ck = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
            this.scrollToBottom();
            this.addStatusMessage(`📊 上下文: ↑${pk} ↓${ck} (${u.total_tokens} tokens)`);
            // 累加到总消耗量
            this.totalUsage.prompt_tokens += u.prompt_tokens;
            this.totalUsage.completion_tokens += u.completion_tokens;
            this.totalUsage.total_tokens += u.total_tokens;
            this.updateContextUsage(this.totalUsage);
          } else {
            const providerConfig = this.settings.providers[this.currentProvider];
            if (providerConfig) {
              const usageResult = await openaiCompatible.sendRequest(
                this.conversation.getMessages(),
                providerConfig
              );
              if (usageResult.success && usageResult.usage) {
                const u = usageResult.usage;
                const pk = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
                const ck = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
                this.scrollToBottom();
                this.addStatusMessage(`📊 上下文: ↑${pk} ↓${ck} (${u.total_tokens} tokens)`);
                // 累加到总消耗量
                this.totalUsage.prompt_tokens += u.prompt_tokens;
                this.totalUsage.completion_tokens += u.completion_tokens;
                this.totalUsage.total_tokens += u.total_tokens;
                this.updateContextUsage(this.totalUsage);
              }
            }
          }
        } catch {}
          } else {
            this.addStatusMessage(`⚠️ ${this.getProviderName()} 返回了空内容`);
          }
        } else {
          done = true;
          // 有工具要执行：把当前 assistant 消息加入历史，删除流式框
          if (fullContent) {
            this.conversation.addAssistantMessage(fullContent);
          }
          streamMsgEl.remove();

          // 把 tool_calls 加入对话历史
          this.conversation.addAssistantMessageWithToolCalls(response.content || "", filteredCalls);

          // 工具循环
          let loopCount = 0;
          let currentCalls = filteredCalls;

          var toolLoopUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
          while (currentCalls.length > 0) {
            loopCount++;
            if (loopCount > 5) {
              this.addStatusMessage("⚠️ 工具调用超过 5 次，停止循环");
              break;
            }
            this.updateLoadingText(loadingEl, "正在执行工具...");
            await this.handleToolCalls(currentCalls);

            this.updateLoadingText(loadingEl, `等待 ${this.getProviderName()} 回复...`);
            const nextResponse = await this.sendRequestWithTools();

            if (!nextResponse.success) {
              this.addErrorMessage(`❌ ${nextResponse.error.code}: ${nextResponse.error.message}`);
              break;
            }
          if (nextResponse.usage) { toolLoopUsage.prompt_tokens += nextResponse.usage.prompt_tokens; toolLoopUsage.completion_tokens += nextResponse.usage.completion_tokens; toolLoopUsage.total_tokens += nextResponse.usage.total_tokens; }
            currentCalls = nextResponse.toolCalls || [];
          }

          loadingEl.remove();
        // 工具循环完成：显示 token 消耗
        try {
          if (response.usage) {
            var mergedUsage = {
              prompt_tokens: (response.usage?.prompt_tokens || 0) + toolLoopUsage.prompt_tokens,
              completion_tokens: (response.usage?.completion_tokens || 0) + toolLoopUsage.completion_tokens,
              total_tokens: (response.usage?.total_tokens || 0) + toolLoopUsage.total_tokens,
            };
            var u = mergedUsage;
            var pk = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
            var ck = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
            this.scrollToBottom();
            this.addStatusMessage("📊 上下文: ↑" + pk + " ↓" + ck + " (" + u.total_tokens + " tokens)");
            this.totalUsage.prompt_tokens += u.prompt_tokens;
            this.totalUsage.completion_tokens += u.completion_tokens;
            this.totalUsage.total_tokens += u.total_tokens;
            this.updateContextUsage(this.totalUsage);
          }
        } catch(e) {}
      }
    }

    if (!done) {
      loadingEl.remove();
      // ABORTED 状态由 abortController.abort() 触发，无须额外提示
      if (response.success) {
        if (fullContent) {
          // 已显示在流式框中，保存到历史
          this.conversation.addAssistantMessage(fullContent);
        } else {
          streamMsgEl.remove();
          this.addStatusMessage(`⚠️ ${this.getProviderName()} 返回了空内容`);
        }
        try {
          // 优先用 response.usage（流式响应可直接返回），没有则 fallback
          if (response.usage) {
            const u = response.usage;
            const pk = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
            const ck = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
            this.scrollToBottom();
            this.addStatusMessage(`📊 上下文: ↑${pk} ↓${ck} (${u.total_tokens} tokens)`);
            // 累加到总消耗量
            this.totalUsage.prompt_tokens += u.prompt_tokens;
            this.totalUsage.completion_tokens += u.completion_tokens;
            this.totalUsage.total_tokens += u.total_tokens;
            this.updateContextUsage(this.totalUsage);
          } else {
            const providerConfig = this.settings.providers[this.currentProvider];
            if (providerConfig) {
              const usageResult = await openaiCompatible.sendRequest(
                this.conversation.getMessages(),
                providerConfig
              );
              if (usageResult.success && usageResult.usage) {
                const u = usageResult.usage;
                const pk = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
                const ck = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
                this.scrollToBottom();
                this.addStatusMessage(`📊 上下文: ↑${pk} ↓${ck} (${u.total_tokens} tokens)`);
                // 累加到总消耗量
                this.totalUsage.prompt_tokens += u.prompt_tokens;
                this.totalUsage.completion_tokens += u.completion_tokens;
                this.totalUsage.total_tokens += u.total_tokens;
                this.updateContextUsage(this.totalUsage);
              }
            }
          }
        } catch {}
      } else {
        streamMsgEl.remove();
        // ABORTED 不显示红框错误，改为状态提示
        if (response.error?.code === "ABORTED") {
          this.conversation.addAssistantMessage("⏹️ 对话已中断");
        } else {
          this.addErrorMessage(`❌ ${response.error.code}: ${response.error.message}`);
        }
        if (streamTextEl.textContent?.trim()) {
          this.addMessage("assistant", streamTextEl.textContent);
          this.conversation.addAssistantMessage(streamTextEl.textContent);
        }
      }
    }

    if (!this.activeTab.title) {
      const msgs = this.conversation.getMessages();
      this.activeTab.title = this.generateConversationTitle(msgs);
    }
    await this.saveConversationRecord(this.activeTab);
    }
  }
  private async sendRequestWithTools(): Promise<UnifiedResponse> {

    const messages = this.conversation.getMessages();
    const tools = this.getTools();

    const signal = this.abortController?.signal;

    // Ollama：先尝试原生工具调用，再解析文本中的工具调用
    if (this.currentProvider === "ollama") {
      let response = await ollamaApi.sendRequestWithTools(messages, tools, {
        baseUrl: this.settings.ollamaBaseUrl,
        model: this.settings.ollamaModel,
        temperature: this.settings.ollamaTemperature,
        maxTokens: this.settings.ollamaMaxTokens,
        numCtx: this.settings.ollamaNumCtx,
        signal,
      });

      // 工具调用失败时（如不支持工具的模型），降级为无工具请求
      if (!response.success) {
        console.warn("[Ollama] 工具调用失败，降级为普通请求:", response.error.message);
        return await this.sendRequest();
      }

      if (response.success && response.content) {
        // 没有原生 tool_calls 时，从文本中解析工具调用
        if (!response.toolCalls || response.toolCalls.length === 0) {
          const toolCalls = this.parseToolCallsFromText(response.content);
          if (toolCalls.length > 0) {
            response.toolCalls = toolCalls;
            console.log("[Ollama] 从文本解析到工具调用:", toolCalls.map((tc: any) => tc.function.name).join(", "));
          } else {
            console.log("[Ollama] 文本中未解析到工具调用, content前100字符:", response.content.substring(0, 100));
          }
        }
        // 解析完后，清理 content 中的工具调用文本
        response.content = this.stripToolCallText(response.content);
      }

      return response;
    }

    // 云端提供商（OpenAI 兼容）：使用统一适配器
    const providerConfig = this.settings.providers[this.currentProvider];
    if (!providerConfig) {
      return {
        success: false,
        error: {
          code: "UNKNOWN_ERROR",
          message: `未知的提供商: ${this.currentProvider}`,
        },
      };
    }
    if (!providerConfig.apiKey) {
      return {
        success: false,
        error: {
          code: "AUTH_ERROR",
          message: `请先在设置中配置 ${providerConfig.name} API Key`,
        },
      };
    }
    return openaiCompatible.sendRequestWithTools(messages, tools, providerConfig, signal);
  }

  /**
   * 从文本中彻底移除所有工具调用残留
   */
  private stripToolCallText(text: string): string {
    let result = text;
    // 用 indexOf + slice 而非正则，避免正则匹配失败

    // 移除 markdown 代码块包裹的 tool_call（如 ```<tool_call>...```）
    const codeBlockPatterns = ["```json\n", "```javascript\n", "```js\n", "```\n", "```"];
    for (const fence of codeBlockPatterns) {
      let cbIdx = result.indexOf(fence + "<tool_call>");
      while (cbIdx !== -1) {
        const cbEnd = result.indexOf("```", cbIdx + fence.length + 11);
        result = cbEnd !== -1
          ? result.slice(0, cbIdx) + result.slice(cbEnd + 3)
          : result.slice(0, cbIdx);
        cbIdx = result.indexOf(fence + "<tool_call>");
      }
    }

    // 移除 <tool_call>...</tool_call>（支持截断：无闭合标签则删到末尾）
    // 也兼容 E4B 的错误闭合标签 <tool_call|>（用 | 代替 /）
    let idx = result.indexOf("<tool_call>");
    if (idx !== -1) {
      let endIdx = result.indexOf("</tool_call>", idx);
      if (endIdx === -1) endIdx = result.indexOf("<tool_call|>", idx);
      result = endIdx !== -1 ? result.slice(0, idx) + result.slice(endIdx + "</tool_call>".length) : result.slice(0, idx);
    }
    // 移除 <tool_call name="..." arguments='...'>
    idx = result.indexOf("<tool_call");
    if (idx !== -1) {
      const endIdx = result.indexOf(">", idx);
      if (endIdx !== -1) result = result.slice(0, idx) + result.slice(endIdx + 1);
    }
    // 移除兼容格式
    const compatPatterns = [
      /\[Tool call:\s*(?:read_file|write_file|Read|Write)\([^)]*\)\]/g,
      /<function=(?:read_file|write_file|Read|Write)>[\s\S]*?<\/function>/g,
    ];
    for (const p of compatPatterns) result = result.replace(p, "");
    // 清理多余空行
    result = result.replace(/\n{3,}/g, "\n\n").trim();
    return result;
  }

  /**
   * 从文本中解析工具调用
   */
  private parseToolCallsFromText(text: string): any[] {
    const toolCalls: any[] = [];
    const seen = new Set<string>();

    const addToolCall = (name: string, args: any, originalText: string) => {
      const key = `${name}:${JSON.stringify(args)}`;
      if (seen.has(key)) return;
      seen.add(key);
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length}`,
        type: "function",
        function: { name, arguments: JSON.stringify(args) },
        originalText,
      });
    };

    const nameMap: Record<string, string> = {
      Read: "read_file", Write: "write_file",
      read: "read_file", write: "write_file",
    };

    // === 核心：从 tool_call 标签中提取内容（支持截断和 E4B 的错误闭合标签 <tool_call|>） ===
    const toolCallRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|<tool_call\|>|$)/g;
    let tcMatch;
    while ((tcMatch = toolCallRegex.exec(text)) !== null) {
      try {
        // 清理内容：去掉 markdown 代码块标记
        let raw = tcMatch[1].trim()
          .replace(/^```(?:json|javascript)?\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();

        // 尝试从内容中提取 JSON 对象
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        let json: any;
        try {
          json = JSON.parse(jsonMatch[0]);
        } catch (e) {
          // JSON 解析失败：E4B 输出的 content 中含未转义双引号（如"欲望"）
          // 回退到手动字段提取
          console.warn("[Ollama] JSON 解析失败，尝试手动提取字段");
          const rawName = raw.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
          if (!rawName) { console.error("[Ollama] 手动提取: 找不到 name"); continue; }
          const toolName = nameMap[rawName] || rawName;
          // 提取 path（从末尾找 "path":"xxx"}）
          const pathM = raw.match(/"path"\s*:\s*"([^"]+)"\s*\}/);
          if (!pathM) { console.error("[Ollama] 手动提取: 找不到 path"); continue; }
          const path = pathM[1];
          // 提取 content：从 "content":" 到 ","path" 之间的文本
          const contentPrefix = '"content":"';
          const contentStart = raw.indexOf(contentPrefix);
          if (contentStart === -1) { console.error("[Ollama] 手动提取: 找不到 content"); continue; }
          const contentValStart = contentStart + contentPrefix.length;
          const pathFieldStr = '","path":"';
          const pathFieldStart = raw.lastIndexOf(pathFieldStr);
          if (pathFieldStart <= contentValStart) { console.error("[Ollama] 手动提取: 无法确定 content 结束位置"); continue; }
          let content = raw.substring(contentValStart, pathFieldStart);
          // 将 \\n 还原为真实换行
          content = content.replace(/\\n/g, "\n");
          if (toolName && path && content) {
            addToolCall(toolName, { path, content }, tcMatch[0]);
            console.log("[Ollama] 手动提取成功:", toolName, path);
          }
          continue;
        }

        // 提取工具名
        const rawName = json.name || "";
        const toolName = nameMap[rawName] || rawName;

        // 提取参数 —— 兼容嵌套 arguments 和平级字段
        let args: any = {};
        if (json.arguments && typeof json.arguments === "object") {
          args = { ...json.arguments };
        } else {
          if (json.path) args.path = json.path;
          if (json.content) args.content = json.content;
          if (json.file_path) args.path = json.file_path;
          if (json.file_content) args.content = json.file_content;
        }

        if (toolName) {
          addToolCall(toolName, args, tcMatch[0]);
        }
      } catch (e) {
        console.error("解析工具调用失败:", e);
      }
    }

    // === 兼容模式：其他格式 ===
    const compatPatterns = [
      /\[Tool call:\s*(read_file|write_file|Read|Write)\(([^)]+)\)\]/g,
      /<function=(read_file|write_file|Read|Write)>([\s\S]*?)<\/function>/g,
      // 12B 格式: <tool_call name="write_file" arguments='{"path":"..."}'>
      /<tool_call\s+name="(\w+)"\s+arguments='(\{[^']+\})'/g,
    ];

    for (const regex of compatPatterns) {
      let match;
      while ((match = regex.exec(text)) !== null) {
        try {
          const rawName = match[1];
          const toolName = nameMap[rawName] || rawName;
          const argsStr = match[2];
          let args: any = {};
          const jsonMatch = argsStr.match(/\{[^}]+\}/);
          if (jsonMatch) args = JSON.parse(jsonMatch[0]);
          const paramMatches = argsStr.matchAll(/<parameter name="(\w+)">(.*?)<\/parameter>/g);
          for (const pm of paramMatches) args[pm[1]] = pm[2];
          if (args.file_path) args.path = args.file_path;
          if (args.file_content) args.content = args.file_content;
          addToolCall(toolName, args, match[0]);
        } catch (e) {
          console.error("解析工具调用失败:", e);
        }
      }
    }

    // 模式1b：小米格式 <function=read><parameter=filePath>path</function>
    const xiaomiFnRegex = /<function=(\w+)>([\s\S]*?)<\/function>/g;
    let xmMatch;
    while ((xmMatch = xiaomiFnRegex.exec(text)) !== null) {
      const rawFn = xmMatch[1];
      const fnBody = xmMatch[2];
      const args: any = {};
      const paramRegex = /<parameter[ =](\w+)>([\s\S]*?)<\/parameter>/g;
      let pm;
      while ((pm = paramRegex.exec(fnBody)) !== null) {
        args[pm[1]] = pm[2];
      }
      const actionName = args.action || rawFn;
      const fnName = (actionName === 'read_file' || actionName === 'write_file') ? actionName : (actionName === 'read' || actionName === 'write') ? actionName + '_file' : rawFn;
      if (args.file_path) args.path = args.file_path;
      if (args.filePath) args.path = args.filePath;
      if (args.file_content) args.content = args.file_content;
      addToolCall(fnName, args, xmMatch[0]);
    }

    // 模式2：代码块中的 vault 操作
    const codeBlockRegex = /```(?:javascript|js)?\s*([\s\S]*?)```/g;
    let codeMatch;
    while ((codeMatch = codeBlockRegex.exec(text)) !== null) {
      const code = codeMatch[1];
      const readMatch = code.match(/vault\.read\(.*?getAbstractFileByPath\(["'](.+?)["']\)/);
      if (readMatch) {
        addToolCall("read_file", { path: readMatch[1] }, codeMatch[0]);
      }
      const writeMatch = code.match(/vault\.(modify|create)\(.*?["'](.+?)["']/);
      if (writeMatch) {
        addToolCall("write_file", { path: writeMatch[2], content: "" }, codeMatch[0]);
      }
    }

    // 模式3：中文描述中的文件路径
    const readPatterns = [
      /读取[文件]*[：:]\s*[`「]?([^\s`」]+\.md)[`」]?/g,
      /读取.*?[`「]([^`」]+\.md)[`」]/g,
      /文件[：:]\s*[`「]?([^\s`」]+\.md)[`」]?/g,
    ];
    for (const regex of readPatterns) {
      let m;
      while ((m = regex.exec(text)) !== null) {
        addToolCall("read_file", { path: m[1] }, m[0]);
      }
    }

    return toolCalls;
  }

  /**
   * 发送 API 请求（普通）
   */
  private async sendRequest(): Promise<UnifiedResponse> {
    const messages = this.conversation.getMessages();
    const signal = this.abortController?.signal;

    if (this.currentProvider === "ollama") {
      return ollamaApi.sendRequest(messages, {
        baseUrl: this.settings.ollamaBaseUrl,
        model: this.settings.ollamaModel,
        temperature: this.settings.ollamaTemperature,
        maxTokens: this.settings.ollamaMaxTokens,
        numCtx: this.settings.ollamaNumCtx,
        signal,
      });
    }

    // 云端提供商：使用统一适配器
    const providerConfig = this.settings.providers[this.currentProvider];
    if (!providerConfig) {
      return {
        success: false,
        error: {
          code: "UNKNOWN_ERROR",
          message: `未知的提供商: ${this.currentProvider}`,
        },
      };
    }
    if (!providerConfig.apiKey) {
      return {
        success: false,
        error: {
          code: "AUTH_ERROR",
          message: `请先在设置中配置 ${providerConfig.name} API Key`,
        },
      };
    }
    return openaiCompatible.sendRequest(messages, providerConfig, signal);
  }

  /**
   * 处理工具调用（参考 Claudian 的显示格式）
   */
  private async handleToolCalls(toolCalls: any[]): Promise<void> {
    for (const toolCall of toolCalls) {
      if (!toolCall?.function) continue;
      const { name, arguments: argsStr } = toolCall.function;

      // 解析参数
      let parsedArgs: any;
      try { parsedArgs = JSON.parse(argsStr); } catch { parsedArgs = {}; }
      if (!parsedArgs.path) {
        console.warn("[AI Lexi] 工具调用参数缺失或缺少 path 字段，跳过:", name, argsStr);
        continue;
      }

      // 显示工具调用（参考 Claudian 格式：📄 Read/AI该学吗.md ✓）
      const toolMsg = this.chatContainer.createDiv({ cls: "message message-tool" });
      const icon = name === "read_file" ? "📄" : "📝";
      const action = name === "read_file" ? "Read" : "Edit";
      const fileName = parsedArgs.path.split("/").pop() || parsedArgs.path;

      // 创建工具行
      const toolRow = toolMsg.createDiv({ cls: "tool-row" });
      toolRow.createSpan({ cls: "tool-icon", text: icon });
      toolRow.createSpan({ cls: "tool-action", text: `${action} ${fileName}` });

      // 执行工具
      const result = await this.executeToolCall(name, parsedArgs);

      // 显示结果（✓ 或错误）
      const resultSpan = toolRow.createSpan({
        cls: result.includes("错误") ? "tool-result-error" : "tool-result-success",
        text: result.includes("错误") ? "❌" : "✓",
      });

      // 将工具执行结果添加到对话历史，供后续模型调用参考
      const content = name === "read_file" && !result.includes("错误")
        ? (result.length > 2000 ? result.substring(0, 2000) + "\n...(内容已截断)" : result)
        : result;
      this.conversation.addToolResult(name, content, toolCall.id || `call_${Date.now()}`);
    }
  }

  /**
   * 获取当前提供商显示名
   */
  private getProviderName(): string {
    if (this.currentProvider === "ollama") return "Ollama";
    const p = this.settings.providers[this.currentProvider];
    return p?.name || this.currentProvider;
  }

  /**
   * 获取当前模型名
   */
  private getModelName(): string {
    if (this.currentProvider === "ollama") return this.settings.ollamaModel;
    const p = this.settings.providers[this.currentProvider];
    return p?.model || "AI";
  }

  /**
   * 异步获取 Ollama 本地模型列表
   */
  private async fetchOllamaModels(): Promise<void> {
    try {
      const models = await ollamaApi.fetchModels(this.settings.ollamaBaseUrl);
      this.ollamaModels = models;
      // 如果当前选中的模型不在列表中，添加到列表
      if (models.length > 0 && !models.includes(this.settings.ollamaModel)) {
        this.ollamaModels = [this.settings.ollamaModel, ...models];
      }
    } catch (e) {
      console.warn("无法获取 Ollama 模型列表:", e);
      this.ollamaModels = [this.settings.ollamaModel];
    }
    this.refreshModelDropdown();
  }

  /**
   * 刷新模型选择器显示文本
   */
  private refreshModelSelector(): void {
    const providerName = this.getProviderName();
    const modelName = this.getModelName();
    this.modelSelectorLabel.setText(`${providerName} · ${modelName}`);
    this.refreshModelDropdown();
  }

  /**
   * 刷新模型下拉菜单内容（两级菜单：提供商 → 模型）
   */
  private refreshModelDropdown(): void {
    this.modelSelectorDropdown.empty();

    // Ollama 本地模型（单独处理，不在 providers 中）
    {
      const providerItem = this.modelSelectorDropdown.createDiv({ cls: "model-provider-item" });
      const label = providerItem.createSpan({ cls: "model-provider-label", text: "Ollama" });
      if (this.currentProvider === "ollama") {
        providerItem.addClass("selected");
      }
      const subMenu = providerItem.createDiv({ cls: "model-submenu" });
      const models = this.ollamaModels.length > 0
        ? this.ollamaModels
        : [this.settings.ollamaModel];
      for (const model of models) {
        const modelItem = subMenu.createDiv({ cls: "model-submenu-item" });
        modelItem.setText(model);
        if (this.currentProvider === "ollama" && this.settings.ollamaModel === model) {
          modelItem.addClass("selected");
        }
        modelItem.addEventListener("click", (e) => {
          e.stopPropagation();
          this.selectModel("ollama", model);
        });
      }
      providerItem.addEventListener("mouseenter", () => { subMenu.addClass("open"); });
      providerItem.addEventListener("mouseleave", () => { subMenu.removeClass("open"); });
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        if (models.length === 1) {
          this.selectModel("ollama", models[0]);
        }
      });
    }

    // 第一级：云端提供商列表
    for (const [id, providerCfg] of Object.entries(this.settings.providers)) {

      const providerItem = this.modelSelectorDropdown.createDiv({ cls: "model-provider-item" });
      const label = providerItem.createSpan({ cls: "model-provider-label", text: providerCfg.name });

      // 当前选中的提供商高亮
      if (this.currentProvider === id) {
        providerItem.addClass("selected");
      }

      // 子菜单容器
      const subMenu = providerItem.createDiv({ cls: "model-submenu" });

      // 填充模型列表
      if (id === "ollama") {
        // Ollama 动态模型
        const models = this.ollamaModels.length > 0
          ? this.ollamaModels
          : [this.settings.ollamaModel];

        for (const model of models) {
          const modelItem = subMenu.createDiv({ cls: "model-submenu-item" });
          modelItem.setText(model);
          if (this.currentProvider === "ollama" && this.settings.ollamaModel === model) {
            modelItem.addClass("selected");
          }
          modelItem.addEventListener("click", (e) => {
            e.stopPropagation();
            this.selectModel("ollama", model);
          });
        }
      } else {
        // 云端提供商：从 availableModels 读取模型列表
        const models = providerCfg.availableModels && providerCfg.availableModels.length > 0
          ? providerCfg.availableModels
          : [providerCfg.model];
        for (const model of models) {
          const modelItem = subMenu.createDiv({ cls: "model-submenu-item" });
          modelItem.setText(model);
          if (this.currentProvider === id && providerCfg.model === model) {
            modelItem.addClass("selected");
          }
          modelItem.addEventListener("click", (e) => {
            e.stopPropagation();
            this.selectModel(id, model);
          });
        }
      }

      // hover 展开子菜单
      providerItem.addEventListener("mouseenter", () => {
        subMenu.addClass("open");
      });
      providerItem.addEventListener("mouseleave", () => {
        subMenu.removeClass("open");
      });

      // 点击提供商名称（如果只有一个模型则直接选择）
      label.addEventListener("click", (e) => {
        e.stopPropagation();
        const models = id === "ollama"
          ? (this.ollamaModels.length > 0 ? this.ollamaModels : [this.settings.ollamaModel])
          : (providerCfg.availableModels || []);
        if (models.length === 1) {
          this.selectModel(id, models[0]);
        }
      });
    }
  }

  /**
   * 选择模型
   */
  private selectModel(provider: string, model: string): void {
    const oldProvider = this.currentProvider;
    const oldModel = this.currentProvider === "ollama"
      ? this.settings.ollamaModel
      : this.settings.providers[this.currentProvider]?.model;

    // 如果是 Ollama 之间切模型，卸载旧模型释放显存
    if (oldProvider === "ollama" && provider === "ollama" && oldModel !== model) {
      ollamaApi.unloadModel(this.settings.ollamaBaseUrl, oldModel);
    } else if (oldProvider === "ollama") {
      // 从 Ollama 切到其他提供商，卸载 Ollama 模型
      ollamaApi.unloadModel(this.settings.ollamaBaseUrl, this.settings.ollamaModel);
    }

    // 更新设置
    if (provider === "ollama") {
      this.settings.ollamaModel = model;
    } else {
      this.settings.providers[provider].model = model;
    }
    this.settings.currentProvider = provider;
    this.settings.currentModel = model;
    this.plugin.saveSettings();

    // 更新状态
    this.currentProvider = provider;
    this.refreshModelSelector();
    this.refreshThinkingSelector();
    this.buildSystemPrompt();
    this.updateWelcomeMessage();

    // 关闭下拉菜单
    this.modelSelectorDropdown.removeClass("open");
  }

  /**
   * 刷新思考等级选择器
   */
  private refreshThinkingSelector(): void {
    const levels = THINKING_LEVELS[this.currentProvider];

    if (!levels || levels.length === 0) {
      this.thinkingSelectorEl.style.display = "none";
      return;
    }

    this.thinkingSelectorEl.style.display = "flex";
    this.thinkingOptionsEl.empty();

    const currentLevel = this.settings.providers[this.currentProvider]?.thinkingLevel || levels[0].value;
    const currentInfo = levels.find((l: { label: string; value: string }) => l.value === currentLevel);
    this.thinkingCurrentEl.setText(currentInfo?.label || levels[0].label);

    for (const level of [...levels].reverse()) {
      const gearEl = this.thinkingOptionsEl.createDiv({ cls: "thinking-gear" });
      gearEl.setText(level.label);
      if (level.value === currentLevel) {
        gearEl.addClass("selected");
      }
      gearEl.addEventListener("click", (e) => {
        e.stopPropagation();
        this.selectThinkingLevel(level.value);
      });
    }
  }

  /**
   * 选择思考等级
   */
  private selectThinkingLevel(level: string): void {
    if (this.currentProvider !== "ollama" && this.settings.providers[this.currentProvider]) {
      this.settings.providers[this.currentProvider].thinkingLevel = level;
      this.plugin.saveSettings();
    }
    this.refreshThinkingSelector();
    this.buildSystemPrompt();
  }

  /**
   * 添加消息到界面
   */
  private async addMessage(role: "user" | "assistant", content: string): Promise<void> {
    const messageEl = this.chatContainer.createDiv({
      cls: `message message-${role}`,
    });

    const roleLabel = role === "user" ? (this.settings.userName || "我") : (this.settings.aiName || "AI Lexi");
    messageEl.createDiv({ cls: "message-role", text: roleLabel });
    const contentEl = messageEl.createDiv({ cls: "message-content" });
    if (role === "assistant") {
      // 创建 text-block 子容器用于 Markdown 渲染
      const textEl = contentEl.createDiv({ cls: "message-text-block" });
      await MarkdownRenderer.render(this.app, content, textEl, "", this);
    } else {
      contentEl.textContent = content;
    }

    // 用户消息下方添加操作按钮
    if (role === "user") {
      const actionsEl = messageEl.createDiv({ cls: "user-msg-actions" });
      const copyBtn = actionsEl.createSpan({ cls: "user-msg-action-btn" });
      setIcon(copyBtn, "copy");
      copyBtn.setAttr("aria-label", "复制消息");
      let feedbackTimeout: number | null = null;
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(content).then(() => {
          if (feedbackTimeout) window.clearTimeout(feedbackTimeout);
          copyBtn.empty();
          copyBtn.setText("已复制");
          copyBtn.addClass("copied");
          feedbackTimeout = window.setTimeout(() => {
            copyBtn.empty();
            setIcon(copyBtn, "copy");
            copyBtn.removeClass("copied");
            feedbackTimeout = null;
          }, 1500);
        });
      });
      const editBtn = actionsEl.createSpan({ cls: "user-msg-action-btn" });
      setIcon(editBtn, "pencil");
      editBtn.setAttr("aria-label", "修改并重新发送");
      editBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.inputEl.value = content;
        this.inputEl.focus();
      });
    }

    this.scrollToBottom();
  }

  /**
   * 添加系统消息
   */
  private addSystemMessage(content: string): void {
    const messageEl = this.chatContainer.createDiv({
      cls: "message message-system",
    });
    messageEl.createDiv({ cls: "message-content", text: content });
  }

  /**
   * 添加错误消息
   */
  private addErrorMessage(content: string): void {
    const messageEl = this.chatContainer.createDiv({
      cls: "message message-error",
    });
    messageEl.createDiv({ cls: "message-role", text: "错误" });
    messageEl.createDiv({ cls: "message-content", text: content });
  }

  /**
   * 添加加载指示器
   */
  private addLoadingIndicator(text: string = "思考中..."): HTMLElement {
    const loadingEl = this.chatContainer.createDiv({
      cls: "message message-loading",
    });
    loadingEl.createDiv({ cls: "loading-spinner" });
    loadingEl.createDiv({ cls: "loading-text", text });
    this.scrollToBottom();
    return loadingEl;
  }

  /**
   * 更新加载提示文字
   */
  private updateLoadingText(loadingEl: HTMLElement, text: string): void {
    const textEl = loadingEl.querySelector(".loading-text");
    if (textEl) textEl.textContent = text;
    this.scrollToBottom();
  }

  /**
   * 添加状态消息（灰色小字）
   */
  private addStatusMessage(text: string): void {
    const msgEl = this.chatContainer.createDiv({
      cls: "message message-status",
    });
    msgEl.createDiv({ cls: "message-content", text });
    this.scrollToBottom();
  }

  /**
   * 滚动到底部
   */
  private scrollToBottom(): void {
    this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
  }

  /**
   * 获取当前提供商的上下文窗口大小
   */
  private getContextWindowSize(): number {
    // Ollama：从设置读取
    if (this.currentProvider === "ollama") {
      return this.settings.ollamaNumCtx || 8192;
    }
    // 云端提供商：从 providers 配置读取
    const provider = this.settings.providers[this.currentProvider];
    if (provider && provider.contextWindow > 0) {
      return provider.contextWindow;
    }
    // 旧数据兼容：provider 存在但没有 contextWindow 字段时用默认值
    if (provider) {
      const defaults: Record<string, number> = {deepseek:1048576,xiaomi:1048576,minimax:1048576,glm:1048576,kimi:262144,qwen:262144,doubao:262144};
      return defaults[this.currentProvider] || 131072;
    }
    return 131072;
  }






  /**
   * 更新上下文使用量显示控件
   */
  private updateContextUsage(usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): void {
    if (!usage || !this.contextUsageEl) {
      // 没有数据时隐藏控件
      if (this.contextUsageEl) this.contextUsageEl.addClass("context-usage-hidden");
      return;
    }
    this.contextUsageEl.removeClass("context-usage-hidden");

    const used = usage.total_tokens;
    const windowSize = this.getContextWindowSize();
    const pct = Math.min(100, Math.round((used / windowSize) * 100));
    const usedStr = used >= 1000 ? (used / 1000).toFixed(1) + "K" : String(used);
    const totalStr = windowSize >= 1000 ? (windowSize / 1000).toFixed(0) + "K" : String(windowSize);
    if (windowSize >= 1000000) {
      var totalDisplay = (windowSize / 1000000).toFixed(0) + "M";
    } else {
      var totalDisplay = totalStr;
    }
    this.contextTooltipEl.setText(usedStr + " / " + totalDisplay);

    // 更新进度条宽度
    const barFill = this.contextBarEl.querySelector(".context-bar-fill") as HTMLElement;
    if (barFill) {
      barFill.style.width = pct + "%";
    }

    // 更新百分比文字
    this.contextPctEl.setText(pct + "%");

    // 根据使用率切换颜色 class
    this.contextUsageEl.removeClass("context-usage-warn", "context-usage-danger", "context-usage-safe");
    if (pct >= 90) {
      this.contextUsageEl.addClass("context-usage-danger");
    } else if (pct >= 70) {
      this.contextUsageEl.addClass("context-usage-warn");
    } else {
      this.contextUsageEl.addClass("context-usage-safe");
    }
  }

  /**
   * 滚动到底部
   */
  /**
   * 更新设置
   */

  /**
   * 异步获取 token 用量（流式响应没有返回 usage 时的 fallback）
   */
  private async fetchUsageAsync(): Promise<void> {
    try {
      const messages = this.conversation.getMessages();
      let result: UnifiedResponse;
      if (this.currentProvider === "ollama") {
        result = await ollamaApi.sendRequest(messages, {
          baseUrl: this.settings.ollamaBaseUrl,
          model: this.settings.ollamaModel,
          temperature: this.settings.ollamaTemperature,
          maxTokens: this.settings.ollamaMaxTokens,
          signal: this.abortController?.signal,
        });
      } else {
        const providerConfig = this.settings.providers[this.currentProvider];
        if (!providerConfig) return;
        result = await openaiCompatible.sendRequest(
          messages,
          providerConfig,
          this.abortController?.signal
        );
      }
      if (result && result.success && result.usage) {
        this.showTokenUsage(result.usage);
      }
    } catch {
      // 静默失败，不影响对话
    }
  }


  /**
   * 显示 token 用量（灰色小字）
   */
  private showTokenUsage(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }): void {
    const u = usage;
    const promptK = u.prompt_tokens >= 1000 ? (u.prompt_tokens / 1000).toFixed(1) + "k" : String(u.prompt_tokens);
    const compK = u.completion_tokens >= 1000 ? (u.completion_tokens / 1000).toFixed(1) + "k" : String(u.completion_tokens);
              this.scrollToBottom();
            this.addStatusMessage(`📊 上下文: ↑${promptK} ↓${compK} (${u.total_tokens} tokens)`);
    // 同时更新顶部的总消耗量控件
    if (this.contextUsageEl) {
      if (usage) {
        this.updateContextUsage(this.totalUsage);
      }
    }
  }

  updateSettings(settings: OllamaChatSettings): void {
    this.settings = settings;
    this.refreshModelSelector();
    this.buildSystemPrompt();
  }
}