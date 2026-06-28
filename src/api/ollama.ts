import { Message, ToolCall, UnifiedResponse } from "../types";

/**
 * Ollama API 配置
 */
export interface OllamaConfig {
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  numCtx?: number;       // 上下文窗口大小，影响显存占用
  signal?: AbortSignal;
}

/**
 * Ollama 原生响应体
 */
interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * 发送请求到 Ollama API
 */
export async function sendRequest(
  messages: Message[],
  config: OllamaConfig
): Promise<UnifiedResponse> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const isV1 = base.endsWith("/v1");
  const endpoint = isV1 ? `${base}/chat/completions` : `${base}/api/chat`;

  // /v1 用 OpenAI 格式，/api/chat 用 Ollama 原生格式
  const buildMsgs = (msgs: any[]) => msgs.map((m: any) => {
    const msg: any = { role: m.role, content: m.content };
    if (m.images && m.images.length > 0) msg.images = m.images;
    return msg;
  });

  const requestBody = isV1
    ? {
        model: config.model,
        messages: messages.map((m: any) => {
          if (m.images && m.images.length > 0) {
            const parts: any[] = [{ type: "text", text: m.content }];
            for (const img of m.images) {
              parts.push({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${img}` },
              });
            }
            return { role: m.role, content: parts };
          }
          return { role: m.role, content: m.content };
        }),
        temperature: config.temperature ?? 0.8,
        max_tokens: config.maxTokens ?? 2000,
        stream: false,
      }
    : {
        model: config.model,
        messages: buildMsgs(messages),
        stream: false,
        options: {
          temperature: config.temperature ?? 0.8,
          num_ctx: config.numCtx ?? 8192,
          top_p: 0.9,
        },
      };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: config.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: `模型 ${config.model} 不存在，请检查模型名称`,
          },
        };
      }
      // 读取 Ollama 的错误详情（如 OOM 等）
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody.error) detail += `: ${errBody.error}`;
      } catch {}
      return {
        success: false,
        error: {
          code: "API_ERROR",
          message: detail,
        },
      };
    }

    const data: any = await response.json();

    if (isV1) {
      const choice = data.choices?.[0];
      return {
        success: true,
        content: choice?.message?.content || "",
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: data.usage?.total_tokens ?? 0,
        },
        model: data.model || config.model,
      };
    }

    // Ollama 原生格式
    return {
      success: true,
      content: data.message.content,
      usage: {
        prompt_tokens: data.prompt_eval_count ?? 0,
        completion_tokens: data.eval_count ?? 0,
        total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      model: data.model,
    };
  } catch (err: any) {
    // 处理网络错误
    if (err.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED")) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: "无法连接到 Ollama 服务，请确保 Ollama 已启动",
        },
      };
    }

    if (err.name === "AbortError" || err.message?.includes("timeout")) {
      return {
        success: false,
        error: {
          code: "TIMEOUT",
          message: "请求超时，请检查网络连接",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: err.message || "未知错误",
      },
    };
  }
}

/**
 * 获取 Ollama 中的可用模型列表
 */
export async function fetchModels(baseUrl: string): Promise<string[]> {
  let base = baseUrl.replace(/\/+$/, "");
  // 如果用了 /v1 路径，去掉 v1 获取原始地址
  if (base.endsWith("/v1")) {
    base = base.replace(/\/v1$/, "");
  }
  const endpoint = `${base}/api/tags`;

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.models?.map((m: any) => m.name) || [];
}

/**
 * 卸载 Ollama 模型，释放显存
 * 发送 keep_alive=0 请求，让 Ollama 立即卸载模型
 */
export async function unloadModel(baseUrl: string, modelName: string): Promise<void> {
  if (!modelName) return;
  let base = baseUrl.replace(/\/+$/, "");
  if (base.endsWith("/v1")) {
    base = base.replace(/\/v1$/, "");
  }
  try {
    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, keep_alive: 0 }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      console.log(`[Ollama] 已卸载模型: ${modelName}`);
    } else {
      console.warn(`[Ollama] 卸载模型返回 ${res.status}`);
    }
  } catch (e) {
    // 静默失败，不影响用户操作
    console.warn(`[Ollama] 卸载模型失败: ${modelName}`, e);
  }
}

/**
 * 发送请求到 Ollama API（支持工具调用）
 */
export async function sendRequestWithTools(
  messages: Message[],
  tools: any[],
  config: OllamaConfig
): Promise<UnifiedResponse> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const isV1 = base.endsWith("/v1");
  const endpoint = isV1 ? `${base}/chat/completions` : `${base}/api/chat`;

  // 保留 tool_name 字段（Ollama 要求 role:"tool" 消息带 tool_name）
  // 注：Ollama 原生 API 不支持 tool_call_id / tool_calls，不传这些字段
  // 如果消息包含图片（视觉模型），一并传递
  const msgs = messages.map((m: any) => {
    const msg: any = { role: m.role, content: m.content };
    if (m.tool_name) msg.tool_name = m.tool_name;
    if (m.images && m.images.length > 0) msg.images = m.images;
    return msg;
  });

  let requestBody: any;
  if (isV1) {
    // V1 (OpenAI 兼容): 图片用 content array 格式
    requestBody = {
      model: config.model,
      messages: msgs.map((m: any) => {
        if (m.images && m.images.length > 0) {
          const parts: any[] = [{ type: "text", text: m.content }];
          for (const img of m.images) {
            parts.push({
              type: "image_url",
              image_url: { url: `data:image/png;base64,${img}` },
            });
          }
          return { role: m.role, content: parts };
        }
        return { role: m.role, content: m.content };
      }),
      temperature: config.temperature ?? 0.8,
      max_tokens: config.maxTokens ?? 2000,
      stream: false,
    };
  } else {
    requestBody = {
      model: config.model,
      messages: msgs,
      stream: false,
      tools: tools,
      options: {
        temperature: config.temperature ?? 0.8,
        num_ctx: config.numCtx ?? 8192,
        top_p: 0.9,
      },
    };
  }

  console.log("[Ollama] Request:", endpoint, "tools:", !!requestBody.tools);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: config.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          error: {
            code: "MODEL_NOT_FOUND",
            message: `模型 ${config.model} 不存在，请检查模型名称`,
          },
        };
      }
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody.error) detail += ": " + errBody.error;
      } catch {}
      return {
        success: false,
        error: {
          code: "API_ERROR",
          message: detail,
        },
      };
    }

    const data: any = await response.json();

    console.log("[Ollama] Response:", data.message?.tool_calls ? "tool_calls:" + data.message.tool_calls.length : "content:" + (data.message?.content?.substring(0, 50) || "empty"));

    // /v1 返回 OpenAI 格式
    if (isV1) {
      const choice = data.choices?.[0];
      return {
        success: true,
        content: choice?.message?.content || "",
        usage: {
          prompt_tokens: data.usage?.prompt_tokens ?? 0,
          completion_tokens: data.usage?.completion_tokens ?? 0,
          total_tokens: data.usage?.total_tokens ?? 0,
        },
        model: data.model || config.model,
      };
    }

    // Ollama 原生格式：转换工具调用
    let toolCalls: ToolCall[] | undefined;
    if (data.message?.tool_calls && data.message.tool_calls.length > 0) {
      toolCalls = data.message.tool_calls.map((tc: any, index: number) => ({
        id: `call_${Date.now()}_${index}`,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: JSON.stringify(tc.function.arguments),
        },
      }));
    }

    return {
      success: true,
      content: data.message?.content || "",
      usage: {
        prompt_tokens: data.prompt_eval_count ?? 0,
        completion_tokens: data.eval_count ?? 0,
        total_tokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      model: data.model,
      toolCalls: toolCalls,
    };
  } catch (err: any) {
    if (err.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED")) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message: "无法连接到 Ollama 服务，请确保 Ollama 已启动",
        },
      };
    }

    if (err.name === "AbortError" || err.message?.includes("timeout")) {
      return {
        success: false,
        error: {
          code: "TIMEOUT",
          message: "请求超时，请检查网络连接",
        },
      };
    }

    return {
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message: err.message || "未知错误",
      },
    };
  }
}


/**
 * 发送流式请求到 Ollama API（纯对话，非工具调用路径）
 * 通过 onToken 回调实时返回内容块，实现流式对话显示
 */
export async function sendRequestStreaming(
  messages: Message[],
  config: OllamaConfig,
  callbacks: import("../types").StreamingCallbacks
): Promise<UnifiedResponse> {
  const base = config.baseUrl.replace(/\/+$/, "");
  const isV1 = base.endsWith("/v1");
  const endpoint = isV1 ? `${base}/chat/completions` : `${base}/api/chat`;

  const buildMsgs = (msgs: any[]) => msgs.map((m: any) => {
    const msg: any = { role: m.role, content: m.content };
    if (m.images && m.images.length > 0) msg.images = m.images;
    return msg;
  });

  const requestBody = isV1
    ? {
        model: config.model,
        messages: messages.map((m: any) => {
          if (m.images && m.images.length > 0) {
            const parts: any[] = [{ type: "text", text: m.content }];
            for (const img of m.images) {
              parts.push({
                type: "image_url",
                image_url: { url: `data:image/png;base64,${img}` },
              });
            }
            return { role: m.role, content: parts };
          }
          return { role: m.role, content: m.content };
        }),
        temperature: config.temperature ?? 0.8,
        max_tokens: config.maxTokens ?? 2000,
        stream: true,
      }
    : {
        model: config.model,
        messages: buildMsgs(messages),
        stream: true,
        options: {
          temperature: config.temperature ?? 0.8,
          num_ctx: config.numCtx ?? 8192,
          top_p: 0.9,
        },
      };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: config.signal,
    });

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: { code: "MODEL_NOT_FOUND", message: `模型 ${config.model} 不存在` } };
      }
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        if (errBody.error) detail += ": " + errBody.error;
      } catch {}
      return { success: false, error: { code: "API_ERROR", message: detail } };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: { code: "NO_STREAM", message: "响应体不支持流式读取" } };
    }

    const decoder = new TextDecoder();
    let fullContent = "";
    let buffer = "";
    let streamUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";  // 最后一个不完整的行留在 buffer 里

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;

        let dataLine = trimmed;
        if (dataLine.startsWith("data: ")) {
          dataLine = dataLine.slice(6);
        }

        try {
          const parsed = JSON.parse(dataLine);
          let token = "";

          if (isV1) {
            // OpenAI 兼容格式
            token = parsed.choices?.[0]?.delta?.content || "";
          } else {
            // Ollama 原生格式
            token = parsed.message?.content || parsed.response || "";
          }

          if (token) {
            fullContent += token;
            callbacks.onToken(token);
          }

          // 从流式 chunk 收集 usage
          if (parsed.done && typeof parsed.eval_count === "number") {
            streamUsage = {
              prompt_tokens: parsed.prompt_eval_count ?? 0,
              completion_tokens: parsed.eval_count,
              total_tokens: (parsed.prompt_eval_count ?? 0) + parsed.eval_count,
            };
          } else if (parsed.usage && typeof parsed.usage.total_tokens === "number") {
            streamUsage = parsed.usage;
          }
        } catch {
          // 忽略解析失败的行（如非 JSON 的控制行）
        }
      }
    }

    // 处理 buffer 中可能残留的数据
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        let token = "";
        if (isV1) {
          token = parsed.choices?.[0]?.delta?.content || "";
        } else {
          token = parsed.message?.content || parsed.response || "";
        }
        if (token) {
          fullContent += token;
          callbacks.onToken(token);
        }

        // 检查 buffer 中的 usage（done chunk 可能在这里）
        if (parsed.done && typeof parsed.eval_count === "number") {
          streamUsage = {
            prompt_tokens: parsed.prompt_eval_count ?? 0,
            completion_tokens: parsed.eval_count,
            total_tokens: (parsed.prompt_eval_count ?? 0) + parsed.eval_count,
          };
        } else if (parsed.usage && typeof parsed.usage.total_tokens === "number") {
          streamUsage = parsed.usage;
        }
      } catch {}
    }

    return {
      success: true,
      content: fullContent,
      model: config.model,
      usage: streamUsage,
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      return { success: false, error: { code: "ABORTED", message: "请求已取消" } };
    }
    if (err.code === "ECONNREFUSED" || err.message?.includes("ECONNREFUSED")) {
      return { success: false, error: { code: "NETWORK_ERROR", message: "无法连接到 Ollama 服务" } };
    }
    return { success: false, error: { code: "UNKNOWN_ERROR", message: err.message || "未知错误" } };
  }
}
