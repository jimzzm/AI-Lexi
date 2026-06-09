# API 规范文档

> 版本：0.1.0
> 最后更新：2026-06-10
> 维护人：项目开发者

## 1. 项目架构

AI Lexi 采用**动态提供商架构**，所有云端模型通过统一的 OpenAI 兼容适配器接入，Ollama 本地模型保持独立路径。

```
┌─────────────────────────────────────────────────┐
│                    view.ts                       │
│  对话 UI、工具调用解析、提供商路由、历史面板       │
└──────────────┬──────────────────────┬────────────┘
               │                      │
     Ollama 路径 │           OpenAI 兼容路径 │
               ▼                      ▼
    ┌──────────────────┐  ┌──────────────────────────┐
    │  api/ollama.ts   │  │  api/openai-compatible.ts │
    │  原生 /api/chat   │  │  /chat/completions        │
    │  XML 工具调用     │  │  原生 function calling    │
    └──────────────────┘  └──────────────────────────┘
               │                      │
               ▼                      ▼
    ┌──────────────────┐  ┌──────────────────────────┐
    │  本地 Ollama      │  │  ProviderConfig 配置表    │
    │  http://localhost │  │  DeepSeek / Kimi / Qwen  │
    │                   │  │  GLM / MiniMax / 豆包    │
    │                   │  │  小米 mimo               │
    └──────────────────┘  └──────────────────────────┘
```

### 核心概念

- **ProviderConfig**：每个云端提供商一个配置对象，定义 baseUrl、model、auth 方式、token 参数名等
- **UnifiedResponse**：统一响应体，屏蔽各 API 差异
- **ConversationHistory**：对话记录持久化，自动保存/加载

---

## 2. 统一数据类型

### Message 接口

```typescript
interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];        // 图片 base64（仅 Ollama 视觉模型）
  tool_name?: string;       // Ollama tool 消息专用
  tool_call_id?: string;    // OpenAI 兼容 API tool 消息专用
  tool_calls?: ToolCall[];  // OpenAI 兼容 API assistant 消息专用
}
```

### ProviderConfig 接口

```typescript
interface ProviderConfig {
  id: string;                    // "deepseek" | "xiaomi" | "kimi" | ...
  name: string;                  // "DeepSeek" | "小米 mimo" | "Kimi"
  enabled: boolean;              // 开关
  apiKey: string;                // API Key
  baseUrl: string;               // API 端点
  model: string;                 // 模型名称
  temperature: number;           // 采样温度 0~2
  maxTokens: number;             // 最大生成 token 数
  authType: "bearer" | "api-key";           // 认证方式
  tokenParam: "max_tokens" | "max_completion_tokens";  // token 参数名
  supportsVision: boolean;       // 是否支持图片
}
```

### ToolCall 接口

```typescript
interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}
```

---

## 3. 统一响应体

### 成功

```json
{
  "success": true,
  "content": "你好！今天有什么可以帮你的？",
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 15,
    "total_tokens": 35
  },
  "model": "deepseek-v4-flash",
  "toolCalls": []
}
```

- `toolCalls`：工具调用时返回，格式同 OpenAI 原生 tool_calls

### 失败

```json
{
  "success": false,
  "error": {
    "code": "API_ERROR",
    "message": "详细的错误描述"
  }
}
```

常见错误码：

| 错误码 | 说明 |
|--------|------|
| `NETWORK_ERROR` | 网络连接失败 |
| `AUTH_ERROR` | API Key 无效（401） |
| `MODEL_NOT_FOUND` | 模型或端点不存在（404） |
| `RATE_LIMIT` | 请求频率过高（429） |
| `TIMEOUT` | 请求超时 |
| `API_ERROR` | API 返回的其他错误 |
| `UNKNOWN_ERROR` | 其他未知错误 |

---

## 4. Ollama API 格式

Ollama 使用原生 `/api/chat` 协议，**不兼容 OpenAI 格式**。

- **端点**：`POST {baseUrl}/api/chat`
- **认证**：无（本地服务）

### 请求体

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

### 图片消息

Ollama 视觉模型在 user 消息中传 `images` 字段（base64 数组）：

```json
{ "role": "user", "content": "分析这张图片", "images": ["iVBORw0KGgo..."] }
```

### 响应体

```json
{
  "model": "qwen2.5:7b",
  "message": { "role": "assistant", "content": "你好！" },
  "done": true,
  "prompt_eval_count": 10,
  "eval_count": 20
}
```

## 5. OpenAI 兼容 API 格式（统一适配器）

所有云端提供商（DeepSeek、Kimi、GLM、Qwen、MiniMax、豆包、小米 mimo）共用 `api/openai-compatible.ts`，差异仅由 ProviderConfig 控制。

- **端点**：`POST {baseUrl}/chat/completions`
- **认证**：`Authorization: Bearer {apiKey}`（大多数）或 `api-key: {apiKey}`（小米）

### 请求体

```json
{
  "model": "deepseek-v4-flash",
  "messages": [
    { "role": "system", "content": "你是一个有用的AI助手" },
    { "role": "user", "content": "你好" }
  ],
  "temperature": 1.0,
  "max_tokens": 4000,
  "top_p": 0.9,
  "stream": false,
  "tools": [],
  "tool_choice": "auto"
}
```

- `max_tokens` 还是 `max_completion_tokens` 由 `ProviderConfig.tokenParam` 决定（小米使用后者）

### 原生 tool_calls

OpenAI 兼容 API 通过原生 `message.tool_calls` 字段支持工具调用：

```json
{
  "choices": [{
    "message": {
      "content": null,
      "tool_calls": [{
        "id": "call_xxx",
        "type": "function",
        "function": {
          "name": "read_file",
          "arguments": "{\"path\":\"note.md\"}"
        }
      }]
    }
  }]
}
```

---

## 6. 工具调用流程

### Ollama 路径（XML 文本解析）

1. `sendRequestWithTools` 调用 API
2. 若无原生 tool_calls，`parseToolCallsFromText()` 从文本提取 `<tool_call>` XML
3. JSON 解析失败时 fallback 到手动字段提取（处理未转义双引号）
4. 执行工具后结果以 `role: "tool"` 加入历史
5. **write_file 后立即 break**（防止模型循环调用）
6. read_file 后继续调 API 让模型看到结果

### OpenAI 兼容路径（原生 function calling）

1. API 返回 `message.tool_calls` 数组
2. 将 assistant 消息（含 tool_calls）加入历史
3. `handleToolCalls` 执行工具
4. 结果以 `role: "tool"` + `tool_call_id` 加入历史
5. 再次调用 API，模型根据工具结果生成回复

### 工具定义

| 工具名 | 说明 | 参数 |
|--------|------|------|
| `read_file` | 读取笔记文件 | `path: string` |
| `write_file` | 写入/覆盖笔记文件 | `path: string`, `content: string` |

---

## 7. 视觉模型支持

当前仅 Ollama 提供商支持。

- 通过 `Message.images` 传 base64 图片数据
- `extractImagesFromNote()` 解析笔记中的 `![[image.png]]` 和 `![](path)` 语法
- `fileToBase64()` 读取文件转 base64（单文件 ≤20MB，每次 ≤5 张）
- 设置中的 `imagePromptTemplate` 可自定义分析提示词

---

## 8. 提供商配置表

| 提供商 | ID | 默认模型 | 认证方式 | token 参数 | 视觉 |
|--------|----|---------|---------|-----------|------|
| DeepSeek | deepseek | deepseek-v4-flash | bearer | max_tokens | ❌ |
| 小米 mimo | xiaomi | mimo-v2.5 | api-key | max_completion_tokens | ❌ |
| Kimi | kimi | kimi-for-coding | bearer | max_tokens | ❌ |
| Qwen | qwen | qwen-plus | bearer | max_tokens | ✅ |
| GLM | glm | glm-5.1 | bearer | max_tokens | ✅ |
| MiniMax | minimax | MiniMax-M3 | bearer | max_tokens | ❌ |
| 豆包 | doubao | ep-xxxxxxxx-xxxxxx | bearer | max_tokens | ❌ |

注：豆包需要先在火山引擎控制台创建推理接入点，使用 `ep-xxxxxx` ID 而非模型名。

---

## 9. 对话历史持久化

使用 Obsidian vault adapter 存储到 `{plugin_dir}/conversations.json`。

### ConversationRecord

```typescript
interface ConversationRecord {
  id: string;             // 唯一 ID
  title: string;          // 自动生成标题（取第一条用户消息前 50 字）
  provider: string;       // 使用的提供商
  model: string;          // 使用的模型
  createdAt: number;      // 创建时间
  updatedAt: number;      // 最后更新时间
  messages: Message[];    // 对话消息
}
```

### 存储策略

- 自动保存：切换标签页、发送消息、关闭对话时
- 图片数据：`images` 字段在保存时剥离（base64 体积过大）
- 轮数限制：`maxHistoryLength` 配置保留的最大轮数
- 历史面板：侧边栏内可加载、删除历史对话

---

## 10. 配置项

### Ollama 配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `ollamaBaseUrl` | Ollama 服务地址 | `http://localhost:11434` |
| `ollamaModel` | 模型名称 | `qwen2.5:7b` |
| `ollamaTemperature` | 采样温度 0~2 | 0.8 |
| `ollamaMaxTokens` | 最大生成 token 数 | 2000 |
| `ollamaNumCtx` | 上下文窗口（滑块 2048~131072） | 8192 |

### 云端提供商配置

通过 `providers: Record<string, ProviderConfig>` 存储，每个提供商独立配置 apiKey、baseUrl、model、temperature、maxTokens。

### 通用配置

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `systemPrompt` | 系统提示词 | 见默认值（AI Lexi 角色定义） |
| `imagePromptTemplate` | 图片分析提示词模板 | 空（不启用） |
| `maxHistoryLength` | 最大保留对话轮数 | 20 |
| `requestTimeout` | API 请求超时（毫秒） | 60000 |

---

## 11. 错误处理示例

```typescript
// 参考 api/openai-compatible.ts
if (!response.ok) {
  if (response.status === 401)
    return { success: false, error: { code: "AUTH_ERROR", message: "API Key 无效" } };
  if (response.status === 404)
    return { success: false, error: { code: "MODEL_NOT_FOUND", message: "API 地址或模型不存在" } };
  if (response.status === 429)
    return { success: false, error: { code: "RATE_LIMIT", message: "请求过于频繁" } };
  // 读取响应体中的 error 字段获取详细错误
  const errBody = await response.json();
  return { success: false, error: { code: "API_ERROR", message: errBody.error?.message || `HTTP ${response.status}` } };
}
```

## 12. LexiTab 多标签页

支持最多 3 个对话标签页同时打开，共享导航栏，每个标签页独立维护对话状态和 provider 选择。
