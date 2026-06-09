/**
 * 统一消息格式
 */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];        // 图片 base64 数据（用于 Ollama 视觉模型）
  tool_name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

/**
 * 工具调用
 */
export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 统一响应体（成功）
 */
export interface UnifiedResponseSuccess {
  success: true;
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  toolCalls?: ToolCall[];
}

/**
 * 统一响应体（失败）
 */
export interface UnifiedResponseError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * 统一响应体
 */
export type UnifiedResponse = UnifiedResponseSuccess | UnifiedResponseError;

/**
 * 提供商类型（动态，值为 provide.id）
 */
export type ProviderType = string;

/**
 * 云端提供商配置
 */
export interface ProviderConfig {
  id: string;
  name: string;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  authType: "bearer" | "api-key";
  tokenParam: "max_tokens" | "max_completion_tokens";
  supportsVision: boolean;
}

/**
 * 插件设置接口
 */
export interface OllamaChatSettings {
  // Ollama 配置（本地模型，参数特殊）
  ollamaBaseUrl: string;
  ollamaModel: string;
  ollamaTemperature: number;
  ollamaMaxTokens: number;
  ollamaNumCtx: number;

  // 云端提供商（统一格式）
  providers: Record<string, ProviderConfig>;

  // 通用配置
  systemPrompt: string;
  imagePromptTemplate: string;
  maxHistoryLength: number;
  requestTimeout: number;
}

/**
 * 历史对话记录
 */
export interface ConversationRecord {
  id: string;
  title: string;
  provider: ProviderType;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}
