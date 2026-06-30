import { Message, ToolCall, UnifiedResponse, ProviderConfig } from "../types";

/** 默认请求超时（毫秒）*/
const REQUEST_TIMEOUT = 60000;

/**
 * 将外部 signal 与超时 signal 合并
 */
function mergeSignals(signal?: AbortSignal): AbortSignal {
  // 兼容旧版 Electron：AbortSignal.any() 可能不存在
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeout]);
  }
  // fallback: 只用外部 signal（timeout 通过 AbortController.race 处理不了，但至少有 ESC 中断能力）
  return signal;
}


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
  _signal?: AbortSignal
): Promise<UnifiedResponse> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const requestBody: Record<string, any> = {
    model: config.model,
    messages: messages.filter((m) => {
      if (m.role === "tool" && !m.tool_call_id) {
        console.warn("[AI Lexi] 跳过缺失 tool_call_id 的 tool 消息:", m.content?.substring(0, 50));
        return false;
      }
      return true;
    }).map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.role === "tool") {
        msg.tool_call_id = m.tool_call_id;
      }
      return msg;
    }),
    temperature: config.temperature,
    [config.tokenParam]: config.maxTokens,
    top_p: 0.9,
    stream: false,
  };

    // Kimi K2.5/K2.6 不支持 temperature/top_p
  if (config.id === "kimi") {
    delete requestBody.temperature;
    delete requestBody.top_p;
    // K2.5 始终开启 thinking 不可禁用，不传 thinking 参数
    if (config.model !== "kimi-k2.5") {
      requestBody.thinking = { type: "disabled" };
    }
  }

  // DeepSeek 思考模式支持
  if (config.id === "deepseek" && config.thinkingLevel) {
    requestBody.reasoning_effort = config.thinkingLevel;
    requestBody.extra_body = { thinking: { type: "enabled" } };
    // 思考模式下不支持 temperature 等参数
    delete requestBody.temperature;
    delete requestBody.top_p;
  }

  // 构建认证头
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authType === "bearer") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else {
    headers["api-key"] = config.apiKey;
  }

  try {
    const mergedSignal = mergeSignals(_signal);
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: mergedSignal,
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
  _signal?: AbortSignal
): Promise<UnifiedResponse> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const requestBody: Record<string, any> = {
    model: config.model,
    messages: messages.filter((m) => {
      // DeepSeek V4 严格要求 tool 消息必须带 tool_call_id，缺失则跳过
      if (m.role === "tool" && !m.tool_call_id) {
        console.warn("[AI Lexi] 跳过缺失 tool_call_id 的 tool 消息:", m.content?.substring(0, 50));
        return false;
      }
      return true;
    }).map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.role === "tool") {
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

    // Kimi K2.5/K2.6 不支持 temperature/top_p
  if (config.id === "kimi") {
    delete requestBody.temperature;
    delete requestBody.top_p;
    // K2.5 始终开启 thinking 不可禁用，不传 thinking 参数
    if (config.model !== "kimi-k2.5") {
      requestBody.thinking = { type: "disabled" };
    }
  }

  // DeepSeek 思考模式支持
  if (config.id === "deepseek" && config.thinkingLevel) {
    requestBody.reasoning_effort = config.thinkingLevel;
    requestBody.extra_body = { thinking: { type: "enabled" } };
    // 思考模式下不支持 temperature 等参数
    delete requestBody.temperature;
    delete requestBody.top_p;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authType === "bearer") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else {
    headers["api-key"] = config.apiKey;
  }

  try {
    const mergedSignal = mergeSignals(_signal);
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: mergedSignal,
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
    console.error("[AI Lexi] API 错误响应:", response.status, JSON.stringify(errBody));
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
  if (err.name === "AbortError") {
    return { success: false, error: { code: "ABORTED", message: "请求已取消" } };
  }
  if (err.message?.includes("timeout")) {
    return { success: false, error: { code: "TIMEOUT", message: "请求超时，请检查网络连接" } };
  }
  return { success: false, error: { code: "UNKNOWN_ERROR", message: err.message || "未知错误" } };
}


/**
 * 发送流式请求到 OpenAI 兼容 API（纯对话，非工具调用路径）
 * 通过 onToken 回调实时返回内容块，实现流式对话显示
 */
export async function sendRequestStreaming(
  messages: Message[],
  tools: any[],
  config: ProviderConfig,
  _signal: AbortSignal | undefined,
  callbacks: import("../types").StreamingCallbacks
): Promise<UnifiedResponse> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const requestBody: Record<string, any> = {
    model: config.model,
    messages: messages.filter((m) => {
      // 跳过缺失 tool_call_id 的 tool 消息（上游迁移时可能产生）
      if (m.role === "tool" && !m.tool_call_id) {
        return false;
      }
      return true;
    }).map((m) => {
      const msg: any = { role: m.role, content: m.content };
      if (m.role === "tool") {
        msg.tool_call_id = m.tool_call_id;
      }
      return msg;
    }),
    tools: tools && tools.length > 0 ? tools : undefined,
    temperature: config.temperature,
    [config.tokenParam]: config.maxTokens,
    top_p: 0.9,
    stream: true,
    stream_options: { include_usage: true },
  };

  // Kimi K2.5/K2.6 不支持 temperature/top_p/stream_options
  if (config.id === "kimi") {
    delete requestBody.temperature;
    delete requestBody.top_p;
    delete requestBody.stream_options;
    // K2.5 始终开启 thinking 不可禁用
    if (config.model !== "kimi-k2.5") {
      requestBody.thinking = { type: "disabled" };
    }
  }

  // DeepSeek 思考模式支持
  if (config.id === "deepseek" && config.thinkingLevel) {
    requestBody.reasoning_effort = config.thinkingLevel;
    requestBody.extra_body = { thinking: { type: "enabled" } };
    delete requestBody.temperature;
    delete requestBody.top_p;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.authType === "bearer") {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  } else {
    headers["api-key"] = config.apiKey;
  }

  try {
    const mergedSignal = mergeSignals(_signal);
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: mergedSignal,
    });

    if (!response.ok) {
      return handleError(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: { code: "NO_STREAM", message: "响应体不支持流式读取" } };
    }

    const decoder = new TextDecoder();
    let fullContent = "";
    let toolCalls: any[] | undefined;
    let buffer = "";
    let streamUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;

        let dataLine = trimmed;
        if (dataLine.startsWith("data: ")) {
          dataLine = dataLine.slice(6);
        }

        try {
          const parsed = JSON.parse(dataLine);

          // 从流式 chunk 中提取 usage（通常在最后一个 chunk 中）
          if (parsed.usage) {
            streamUsage = parsed.usage;
          }

          // DeepSeek 思考内容
          if (parsed.choices?.[0]?.delta?.reasoning_content) {
            callbacks.onThinking?.(parsed.choices[0].delta.reasoning_content);
          }

          const token = parsed.choices?.[0]?.delta?.content || "";
          if (token) {
            fullContent += token;
            callbacks.onToken(token);
          }

          // 收集 streaming 中的 tool_calls（DeepSeek 等原生工具调用）
          const deltaToolCalls = parsed.choices?.[0]?.delta?.tool_calls;
          if (deltaToolCalls && deltaToolCalls.length > 0) {
            if (!toolCalls) toolCalls = [];
            for (const tc of deltaToolCalls) {
              const index = tc.index ?? 0;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tc.id || `call_${Date.now()}_${index}`,
                  type: "function",
                  function: { name: "", arguments: "" },
                };
              }
              if (tc.function?.name) toolCalls[index].function.name += tc.function.name;
              if (tc.function?.arguments) toolCalls[index].function.arguments += tc.function.arguments;
            }
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }

    //     // 处理 buffer 中残留的数据
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const token = parsed.choices?.[0]?.delta?.content || "";
        if (token) {
          fullContent += token;
          callbacks.onToken(token);
        }

        // buffer 中的 chunk 也可能包含 usage
        if (parsed.usage && typeof parsed.usage === 'object') {
          streamUsage = {
            prompt_tokens: parsed.usage.prompt_tokens ?? 0,
            completion_tokens: parsed.usage.completion_tokens ?? 0,
            total_tokens: parsed.usage.total_tokens ?? 0,
          };
        }
      } catch {}
    }
    return {
      success: true,
      content: fullContent,
      model: config.model,
      toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
      usage: streamUsage,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { success: false, error: { code: "ABORTED", message: "请求已取消" } };
    }
    return handleFetchError(err);
  }
}
