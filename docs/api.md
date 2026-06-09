# API 规范文档

> 版本：2.0.0  
> 最后更新：2026-06-09  
> 维护人：项目开发者

## 1. 统一数据类型与请求/响应格式

为了屏蔽不同模型 API 的差异，所有模型适配器（adapter）都应遵循以下统一格式。

### Message 接口

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];        // 图片 base64 数据（仅 Ollama 视觉模型）
  tool_name?: string;       // Ollama tool 消息专用
  tool_call_id?: string;    // DeepSeek/Xiaomi tool 消息专用
  tool_calls?: ToolCall[];  // DeepSeek/Xiaomi assistant 消息专用
}
```

### 统一请求体

```json
{
  "messages": [
    { "role": "system", "content": "你是一个有用的AI助手" },
    { "role": "user", "content": "你好！" }
  ],
  "model": "llama3.2",
  "options": {
    "temperature": 0.7,
    "max_tokens": 2000,
    "stream": false
  }
}
```

- `messages`：对话消息数组，支持 `system`、`user`、`assistant`、`tool` 四种角色。
- `model`：模型名称（如 `llama3.2`、`deepseek-chat`）。
- `options.temperature`：采样温度，范围 0~2，越高输出越随机。
- `options.max_tokens`：最大生成 token 数。
- `options.stream`：是否流式输出（第一版固定为 `false`）。

### 统一响应体（成功）

```json
{
  "success": true,
  "content": "你好！今天有什么可以帮你的？",
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 15,
    "total_tokens": 35
  },
  "model": "llama3.2"
}
```

- `success`：请求是否成功。
- `content`：AI 回复的纯文本内容。
- `usage`：token 使用统计（可选，但建议提供）。
- `model`：实际使用的模型名称。

工具调用场景下，响应还会包含：

```json
{
  "success": true,
  "content": "",
  "toolCalls": [
    { "id": "call_1", "type": "function", "function": { "name": "read_file", "arguments": "{\"path\":\"note.md\"}" } }
  ],
  "model": "qwen2.5:7b"
}
```

### 统一响应体（失败）

```json
{
  "success": false,
  "error": {
    "code": "API_ERROR",
    "message": "详细的错误描述",
    "details": {}
  }
}
```

常见错误码：
- `NETWORK_ERROR`：网络连接失败
- `AUTH_ERROR`：认证失败（API Key 无效）
- `RATE_LIMIT`：请求频率过高
- `MODEL_NOT_FOUND`：模型不存在
- `TIMEOUT`：请求超时
- `UNKNOWN_ERROR`：其他未知错误

---

## 2. Ollama API 格式

Ollama 是本地运行的模型，无需 API Key，默认监听 `http://localhost:11434`。

- **接口**：`POST /api/chat`
- **完整端点**：`http://localhost:11434/api/chat`

### 请求体（Ollama 原生格式）

```json
{
  "model": "qwen2.5:7b",
  "messages": [
    { "role": "system", "content": "你是一个有帮助的AI助手" },
    { "role": "user", "content": "你好" }
  ],
  "stream": false,
  "options": {
    "temperature": 0.8,
    "top_p": 0.9,
    "num_ctx": 8192
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 模型名称，必须与 `ollama list` 显示的完全一致 |
| `messages` | array | 对话消息，角色支持 `system`/`user`/`assistant`/`tool` |
| `stream` | boolean | 设为 `false`（第一版不支持流式） |
| `options.temperature` | number | 采样温度，默认 0.8 |
| `options.top_p` | number | 核采样参数，默认 0.9 |
| `options.num_ctx` | number | 上下文窗口大小（token 数），默认 8192，可在设置页滑块调整（2048~131072） |
| `options.num_predict` | number | **工具调用场景不要设置**，否则会截断 `<tool_call>` XML |

**图片消息**：视觉模型的 user 消息可附加 `images` 字段（base64 字符串数组）：

```json
{ "role": "user", "content": "分析这张图片", "images": ["iVBORw0KGgo..."] }
```

Ollama 原生 API 通过 `images` 字段直接传递 base64；`/v1` 端点使用 content array 格式：

```json
{ "role": "user", "content": [{ "type": "text", "text": "分析" }, { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }] }
```

### 响应体（Ollama 原生格式）

```json
{
  "model": "qwen2.5:7b",
  "created_at": "2026-06-06T12:00:00.000Z",
  "message": {
    "role": "assistant",
    "content": "你好！今天有什么可以帮助你的？"
  },
  "done": true,
  "total_duration": 2500000000,
  "load_duration": 5000000,
  "prompt_eval_count": 10,
  "eval_count": 20
}
```

**转换为统一响应体**：

```json
{
  "success": true,
  "content": "你好！今天有什么可以帮助你的？",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  },
  "model": "qwen2.5:7b"
}
```

**注意事项**：
- 默认 Ollama 服务地址为 `http://localhost:11434`，用户可在插件设置中修改。
- 如果 Ollama 未运行，请求会失败，应返回 `NETWORK_ERROR`。
- 模型名称大小写敏感，建议提供下拉选择或自动从 `ollama list` 获取。

---

## 3. DeepSeek API 格式

DeepSeek 提供云端 API，需要有效的 API Key。

- **接口**：`POST /chat/completions`
- **完整端点**：`https://api.deepseek.com/v1/chat/completions`
- **认证**：`Authorization: Bearer YOUR_API_KEY`

### 请求体（DeepSeek 原生格式）

```json
{
  "model": "deepseek-chat",
  "messages": [
    { "role": "system", "content": "你是一个有用的AI助手" },
    { "role": "user", "content": "你好" }
  ],
  "temperature": 1.0,
  "max_tokens": 4000,
  "top_p": 1.0,
  "stream": false,
  "response_format": { "type": "text" }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `model` | string | 固定为 `deepseek-chat` 或 `deepseek-coder` |
| `messages` | array | 对话消息，角色支持 `system`/`user`/`assistant` |
| `temperature` | number | 采样温度，范围 0~2，默认 1.0 |
| `max_tokens` | number | 最大生成 token 数，默认 4000 |
| `top_p` | number | 核采样参数，默认 1.0 |
| `stream` | boolean | 设为 `false`（第一版不支持流式） |
| `response_format` | object | 可指定 `{"type": "json_object"}` 强制输出 JSON |

### 响应体（DeepSeek 原生格式）

```json
{
  "id": "chatcmpl-xxxxxxxx",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "你好！今天有什么可以帮助你的？"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  }
}
```

**转换为统一响应体**：

```json
{
  "success": true,
  "content": "你好！今天有什么可以帮助你的？",
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 20,
    "total_tokens": 30
  },
  "model": "deepseek-chat"
}
```

**注意事项**：
- API Key 由用户在插件设置中输入，**严禁硬编码**。
- 请求超时建议设置为 60 秒，避免网络波动。
- 如果 API Key 无效，应返回 `AUTH_ERROR`。
- 官方文档：[DeepSeek API 文档](https://platform.deepseek.com/api-docs/)

---

## 4. 添加新模型的步骤

当需要支持新模型（如智谱 ChatGLM、通义千问、Moonshot 等）时，按以下步骤操作：

1. **创建适配器文件**：在 `src/api/` 目录下新建 `{model_name}.ts`。
2. **实现核心函数**：
   ```typescript
   import { Message, UnifiedResponse } from "../types";

   export interface XxxConfig {
     baseUrl: string;
     model: string;
     temperature?: number;
     maxTokens?: number;
     signal?: AbortSignal;
   }

   export async function sendRequest(
     messages: Message[],
     config: XxxConfig
   ): Promise<UnifiedResponse> {
     // 1. 将统一 Message[] 转换为厂商原生请求体
     // 2. 发送 HTTP 请求（支持 AbortSignal 取消）
     // 3. 将原生响应转换为 UnifiedResponse
     // 4. 读取错误响应体 error 字段获取详细错误
   }
   ```
3. **在设置界面添加模型选项**：在 `src/settings.ts` 中添加配置项，让用户选择模型、配置 API Key 和端点地址。参考已有的 `OllamaChatSettings` 接口和 `DEFAULT_SETTINGS`。
4. **在 `src/view.ts` 添加提供商切换**：在 `refreshProviderOptions()` 中添加新选项，注意 `dataset.provider` 映射回调。
5. **在 `view.ts` 的 `buildSystemPrompt()` 中添加工具规则**：如果新提供商使用原生 tool_calls，用 `getStandardToolRules()`；如果使用文本解析（XML），参考 `getOllamaToolRules()`。
6. **更新本 API 文档**：添加新提供商的请求/响应示例和注意事项。
7. **测试**：手动测试多轮对话场景，确保历史消息正确传递。注意测试工具调用路径和错误处理。

---

## 5. 多轮对话的历史消息格式

所有模型适配器必须能够正确处理数组形式的历史消息，例如：

```json
{
  "messages": [
    { "role": "user", "content": "我叫张三" },
    { "role": "assistant", "content": "你好张三！" },
    { "role": "user", "content": "我叫什么名字？" }
  ]
}
```

**要求**：
- 保持消息顺序：从最早到最新。
- 确保角色名称统一为 `system` / `user` / `assistant`。
- 如果厂商使用不同角色名（如 `bot`），适配器需做转换。
- 可选：限制最大历史轮数（如保留最近 10 轮），防止上下文溢出。

---

## 6. 错误处理示例

以下是一个典型的错误响应转换（参考 `src/api/ollama.ts`）：

```typescript
try {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
    signal: config.signal,
  });

  if (!response.ok) {
    if (response.status === 404) {
      return { success: false, error: { code: 'MODEL_NOT_FOUND', message: '模型不存在' } };
    }
    // 读取 Ollama 错误详情（如 OOM 等）
    let detail = `HTTP ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody.error) detail += `: ${errBody.error}`;
    } catch {}
    return { success: false, error: { code: 'API_ERROR', message: detail } };
  }
  // ... 解析成功响应
} catch (err: any) {
  if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: '无法连接到服务' } };
  }
  if (err.name === 'AbortError' || err.message?.includes('timeout')) {
    return { success: false, error: { code: 'TIMEOUT', message: '请求超时' } };
  }
  return { success: false, error: { code: 'UNKNOWN_ERROR', message: err.message } };
}
```

---

## 7. 工具调用

插件支持两种工具调用路径，取决于提供商。

### DeepSeek / 小米 mimo 路径（原生 tool_calls）

API 返回 `message.tool_calls` 数组，流程：

1. 将 assistant 消息（含 `tool_calls`）加入对话历史
2. 执行工具，结果以 `role: "tool"` 消息加入历史（带 `tool_call_id`）
3. 再次调用 API，模型根据工具结果生成回复

### Ollama 路径（文本解析 XML）

Ollama 部分模型（如 qwen2.5、gemma 等）不支持原生 function calling，通过 `<tool_call>` XML 标签在文本中标记工具调用：

```
<tool_call>
{"name":"read_file","content":"读取笔记","path":"note.md"}
</tool_call>
```

流程：

1. `sendRequestWithTools` 调用 Ollama API（带 tools 参数，部分模型会返回原生 tool_calls）
2. 若无原生 tool_calls，用 `parseToolCallsFromText()` 从文本提取 `<tool_call>` JSON
3. JSON 解析失败时（如 content 中含未转义双引号），fallback 到手动字段提取
4. 执行工具后，结果以 `role: "tool"` 加入历史
5. 若执行了 `write_file`，立即停止循环（否则模型会反复调用）
6. 若仅执行 `read_file`，继续调 API 让模型看到结果

**工具失败降级**：如果 `sendRequestWithTools` 返回错误（如模型不支持工具），会自动降级为不带工具的纯文本请求。

### 工具定义

当前定义了两个工具：

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `read_file` | 读取笔记文件内容 | `path: string` |
| `write_file` | 写入/覆盖笔记文件 | `path: string`, `content: string` |

---

## 8. 视觉模型支持

仅 Ollama 提供商支持。通过 `Message.images` 字段传递图片 base64 数据。

### 图片提取流程

1. `extractImagesFromNote()` 解析当前笔记中的 `![[image.png]]` 和 `![](path)` 语法
2. 通过 `metadataCache.getFirstLinkpathDest()` 解析 wiki 链接
3. `fileToBase64()` 读取文件并转为 base64（单文件 ≤20MB，每次 ≤5 张）
4. 图片数据通过 `addUserMessage(content, images)` 传递给 ConversationManager

### API 层转换

- **Ollama 原生 API**（`/api/chat`）：`images` 字段直接放 base64 字符串数组
- **Ollama V1 API**（`/v1/chat/completions`）：content 数组格式，`type: "image_url"` + `data:image/png;base64,...`

### 配置

- `ollamaNumCtx`：上下文窗口大小，视觉模型建议 4096~8192（过高会大量占用显存）
- `imagePromptTemplate`：图片分析的系统提示词模板，在设置页自定义

### 显存管理

- 切换模型 / 新建标签页 / 新建对话时自动卸载旧模型（调用 `/api/generate` + `keep_alive: 0`）
- `unloadModel()` 超时 10 秒，静默失败不影响用户操作

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `ollamaBaseUrl` | Ollama 服务地址 | `http://localhost:11434` |
| `ollamaModel` | Ollama 模型名 | `qwen2.5:7b` |
| `ollamaTemperature` | Ollama 采样温度 | 0.8 |
| `ollamaMaxTokens` | Ollama 最大生成 token 数 | 2000 |
| `ollamaNumCtx` | Ollama 上下文窗口（滑块 2048~131072） | 8192 |
| `deepseekApiKey` | DeepSeek API Key | 空（用户必须填写） |
| `deepseekBaseUrl` | DeepSeek API 端点 | `https://api.deepseek.com/v1` |
| `deepseekModel` | DeepSeek 模型名 | `deepseek-chat` |
| `deepseekTemperature` | DeepSeek 采样温度 | 1.0 |
| `deepseekMaxTokens` | DeepSeek 最大生成 token 数 | 4000 |
| `xiaomiApiKey` | 小米 mimo API Key | 空（用户必须填写） |
| `xiaomiBaseUrl` | 小米 mimo API 端点 | `https://api.xiaomimimo.com/v1` |
| `xiaomiModel` | 小米 mimo 模型名 | `mimo-v2.5` |
| `xiaomiTemperature` | 小米 mimo 采样温度 | 0.7 |
| `xiaomiMaxTokens` | 小米 mimo 最大生成 token 数 | 4000 |
| `systemPrompt` | 系统提示词（定义 AI 角色行为） | 见默认值 |
| `imagePromptTemplate` | 图片分析提示词模板（仅 Ollama 视觉模型） | 空（不启用） |
| `maxHistoryLength` | 最大保留对话轮数 | 20 |
| `requestTimeout` | API 请求超时（毫秒） | 60000 |
```