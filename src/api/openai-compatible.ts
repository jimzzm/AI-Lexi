import { Message, ToolCall, UnifiedResponse, ProviderConfig } from "../types";

/**
 * OpenAI 兼容 API 的统一适配器
 * 支持所有使用 OpenAI 格式的提供商（DeepSeek、Kimi、GLM、Qwen、MiniMax、豆包、小米）
 * 通过 ProviderConfig 控制差异（auth 方式、参数名等）
 */

/**
 * 发送请求（无工具调用）
 */
export async function sendRequest(
  messages: Message[],
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<UnifiedResponse> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const requestBody: Record<string, any> = {
    model: config.model,
    messages: messages.map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.role === "tool" && m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }
      return msg;
    }),
    temperature: config.temperature,
    [config.tokenParam]: config.maxTokens,
    top_p: 0.9,
    stream: false,
  };

  // 构建认证头
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authType === "bearer") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else {
    headers["api-key"] = config.apiKey;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      return handleError(response);
    }

    const data: any = await response.json();

    return {
      success: true,
      content: data.choices?.[0]?.message?.content || "",
      usage: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model || config.model,
    };
  } catch (err: any) {
    return handleFetchError(err);
  }
}

/**
 * 发送请求（支持工具调用）
 */
export async function sendRequestWithTools(
  messages: Message[],
  tools: any[],
  config: ProviderConfig,
  signal?: AbortSignal
): Promise<UnifiedResponse> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const requestBody: Record<string, any> = {
    model: config.model,
    messages: messages.map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.role === "tool" && m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }
      if (m.role === "assistant" && m.tool_calls) {
        msg.tool_calls = m.tool_calls;
      }
      return msg;
    }),
    temperature: config.temperature,
    [config.tokenParam]: config.maxTokens,
    top_p: 0.9,
    stream: false,
    tools: tools,
    tool_choice: "auto",
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authType === "bearer") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else {
    headers["api-key"] = config.apiKey;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal,
    });

    if (!response.ok) {
      return handleError(response);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];

    let toolCalls: ToolCall[] | undefined;
    if (choice?.message?.tool_calls && choice.message.tool_calls.length > 0) {
      toolCalls = choice.message.tool_calls;
    }

    return {
      success: true,
      content: choice?.message?.content || "",
      usage: {
        prompt_tokens: data.usage?.prompt_tokens ?? 0,
        completion_tokens: data.usage?.completion_tokens ?? 0,
        total_tokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model || config.model,
      toolCalls,
    };
  } catch (err: any) {
    return handleFetchError(err);
  }
}

/**
 * 处理 HTTP 错误响应
 */
async function handleError(response: Response): Promise<UnifiedResponse> {
  if (response.status === 401) {
    return { success: false, error: { code: "AUTH_ERROR", message: "API Key 无效，请检查设置" } };
  }
  if (response.status === 404) {
    return { success: false, error: { code: "MODEL_NOT_FOUND", message: "API 地址或模型不存在，请检查设置" } };
  }
  if (response.status === 429) {
    return { success: false, error: { code: "RATE_LIMIT", message: "请求过于频繁，请稍后再试" } };
  }
  let detail = `HTTP ${response.status}`;
  try {
    const errBody = await response.json();
    if (errBody.error?.message) {
      detail += `: ${errBody.error.message}`;
    } else if (errBody.error) {
      detail += `: ${typeof errBody.error === "string" ? errBody.error : JSON.stringify(errBody.error)}`;
    } else if (errBody.message) {
      detail += `: ${errBody.message}`;
    }
  } catch {}
  return { success: false, error: { code: "API_ERROR", message: detail } };
}

/**
 * 处理网络/运行时错误
 */
function handleFetchError(err: any): UnifiedResponse {
  if (err.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED")) {
    return { success: false, error: { code: "NETWORK_ERROR", message: "无法连接到 API 服务" } };
  }
  if (err.name === "AbortError" || err.message?.includes("timeout")) {
    return { success: false, error: { code: "TIMEOUT", message: "请求超时，请检查网络连接" } };
  }
  return { success: false, error: { code: "UNKNOWN_ERROR", message: err.message || "未知错误" } };
}
