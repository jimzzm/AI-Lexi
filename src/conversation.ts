import { Message } from "./types";

/**
 * 对话状态管理
 * 负责管理多轮对话的历史消息
 */
export class ConversationManager {
  private messages: Message[] = [];
  private maxHistoryLength: number;

  constructor(maxHistoryLength: number = 20) {
    this.maxHistoryLength = maxHistoryLength;
  }

  /**
   * 获取所有历史消息
   */
  getMessages(): Message[] {
    return [...this.messages];
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content: string, images?: string[]): void {
    this.messages.push({
      role: "user",
      content,
      images,
    });
    this.trimHistory();
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(content: string): void {
    this.messages.push({
      role: "assistant",
      content,
    });
    this.trimHistory();
  }

  /**
   * 添加助手消息（含工具调用）
   */
  addAssistantMessageWithToolCalls(content: string, toolCalls: import("./types").ToolCall[]): void {
    this.messages.push({
      role: "assistant",
      content,
      tool_calls: toolCalls,
    });
    this.trimHistory();
  }

  /**
   * 添加工具执行结果（Ollama 要求 role:"tool"）
   */
  addToolResult(toolName: string, content: string, toolCallId?: string): void {
    const msg: any = {
      role: "tool",
      tool_name: toolName,
      content,
    };
    if (toolCallId) {
      msg.tool_call_id = toolCallId;
    }
    this.messages.push(msg);
    this.trimHistory();
  }

  /**
   * 设置系统提示
   */
  setSystemPrompt(content: string): void {
    // 移除现有的系统消息
    this.messages = this.messages.filter((m) => m.role !== "system");
    // 在开头添加新的系统消息
    this.messages.unshift({
      role: "system",
      content,
    });
  }

  /**
   * 清空对话历史（重置上下文）
   */
  clear(): void {
    this.messages = [];
  }

  /**
   * 获取对话轮数
   */
  getTurnCount(): number {
    // 计算 user-assistant 对的数量
    let count = 0;
    for (let i = 0; i < this.messages.length; i++) {
      if (this.messages[i].role === "user") {
        count++;
      }
    }
    return count;
  }

  /**
   * 裁剪历史消息，保持在最大长度内
   */
  private trimHistory(): void {
    // 保留系统消息
    const systemMessages = this.messages.filter((m) => m.role === "system");
    const nonSystemMessages = this.messages.filter((m) => m.role !== "system");

    // 如果非系统消息超过限制，移除最早的消息
    if (nonSystemMessages.length > this.maxHistoryLength) {
      const excess = nonSystemMessages.length - this.maxHistoryLength;
      this.messages = [...systemMessages, ...nonSystemMessages.slice(excess)];
    }
  }

  /**
   * 导出对话历史（用于调试或持久化）
   */
  export(): Message[] {
    return this.getMessages();
  }

  /**
   * 导入对话历史
   */
  import(messages: Message[]): void {
    this.messages = [...messages];
    this.trimHistory();
  }
}
