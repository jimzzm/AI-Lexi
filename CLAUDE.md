# 项目协作规则

## 本文档的修改规则（必须遵守）

除非我明确要求修改本文档，否则你不允许擅自修改、追加、删除任何内容。**即使是改进方案或修复 bug，也只改代码，不改本文档。** 本文档只记录我确认过的方法和规则。

## 项目简介
AI Lexi（原 Ollama Chat）— Obsidian 侧边栏 AI 聊天插件，支持 Ollama / DeepSeek / Xiaomi mimo 三个提供商。
主要开发文件：`src/api/ollama.ts`（Ollama API）、`src/view.ts`（UI 渲染 + 工具调用解析 + 对话流程）、`src/settings.ts`（配置）。
对话栏下拉框显示的是 settings 里配置的实际模型名（而非固定提供商名），通过 `dataset.provider` 属性映射回提供商。

## 反复出现的错误（务必避免）

### 1. num_predict 截断导致工具调用失败
- **现象**：Ollama 返回的 XML 被截断，缺少 `</tool_call>`，正则匹配失败。
- **根因**：`sendRequestWithTools` 里设了 `num_predict: 2000`。
- **修复**：不要设 `num_predict`，让模型自然结束输出。
- **教训**：工具调用场景下，任何输出长度限制都可能破坏结构化格式。

### 2. 工具执行结果作为 assistant 消息导致循环调用
- **现象**：模型看到自己的工具执行结果后，再次输出 `<tool_call>`，形成死循环。
- **修复**：工具执行结果必须用 `addUserMessage`（role: "user"），不能用 `addAssistantMessage`。
- **教训**：模型会把 assistant 消息当作自己说的，从而"接着"继续调用工具。

### 3. 正则要求闭合标签但输出被截断
- **现象**：正则 `/<tool_call>[\s\S]*?<\/tool_call>/g` 无法匹配没有 `</tool_call>` 的截断输出。
- **修复**：改用 `indexOf` 手动定位，支持截断情况；或用 `(?:<\/tool_call>|$)` 匹配。

### 4. 工具描述注入混淆模型
- **现象**：在 tools JSON 前注入 `## 可用工具\n\n直接调用工具，不要询问确认`，导致模型输出混乱格式（如 `[Tool call: Read(...)]`）。
- **修复**：工具描述只放在 `tools` JSON 内部，不要在外部重复注入大段提示。
- **教训**：模型已能从 tools JSON 理解工具，额外注入反而干扰。

### 5. E4B 模型写文件前询问确认
- **现象**：E4B 在调用 write_file 前会问"要我帮你写入吗？"。
- **修复**：system prompt 中加入 `直接调用工具，不要询问用户确认`。
- **教训**：小模型倾向"礼貌"确认，需要明确指令。

### 6. 模型输出冗长（重写整个文件）
- **现象**：模型调用 write_file 后，还会在对话中输出完整的重写内容。
- **修复**：system prompt 加 `回复要简洁，不要重复笔记内容`。此问题部分源于模型行为，提示词只能缓解。
- **教训**：模型行为问题，提示词只能部分解决，必要时需要后处理截断。

### 7. replace() 处理多行文本失败
- **现象**：`content.replace(tc.originalText, "")` 无法匹配包含换行符的 tool call 原始文本。
- **根因**：`replace` 的第一个参数如果是动态字符串，特殊字符会导致匹配失败。
- **修复**：改用 `indexOf` + `slice` 手动拼接，不依赖 `replace`。

### 8. stripToolCallText 在 parseToolCallsFromText 之前执行
- **现象**：`cleanContent` 中 `stripToolCallText` 先运行，把 tool call 文本删了，导致后续 `parseToolCallsFromText` 无法解析。
- **修复**：严格按顺序执行：先 `parseToolCallsFromText` 提取工具调用，再 `stripToolCallText` 清理文本。

### 9. Ollama 流式响应格式变化
- **现象**：旧版 Ollama 的 `message.tool_calls` 格式与新版不同，`done_reason` 在不同位置。
- **教训**：处理 Ollama 响应时做防御性检查，兼容新旧格式。

### 10. E4B 需要详细易懂的指令和示例
- **现象**：指令太短或太复杂，E4B 都不跟。它不输出 `<tool_call>` XML，把编辑内容直接输出到对话中。
- **修复**：指令要用**详细的多行 JSON 格式 + 示例**，放在 system prompt 末尾。单行 JSON 格式和被截断的指令 E4B 理解不了。
- **教训**：E4B 这类中等规模模型的 system prompt 既不能太长（会丢失重点），也不能太短（不知道该怎么做）。要有明确的步骤、格式示例、规则说明三者缺一不可。

### 11. 不同提供商需要不同的 system prompt 工具规则
- **现象**：Ollama 模型需要 XML `<tool_call>` 标签来调用工具，DeepSeek/Xiaomi 用原生 tool_calls。
- **修复**：`buildSystemPrompt()` 按 `currentProvider` 追加不同的规则：
  - Ollama：`getOllamaToolRules()` → 教模型输出 `<tool_call>` XML，强调简洁回复
  - 其他：`getStandardToolRules()` → 禁止输出 XML 标签（原生 tool_calls 自动处理）
- **教训**：切换提供商时必须重建 system prompt（`providerSelect.change` 事件中调用 `buildSystemPrompt()`）。

### 12. Ollama 文本解析路径：write_file 后必须 break，否则模型会循环调用
- **现象**：模型每次看到工具执行结果都会再输出一个新的 `<tool_call>`，导致 write_file 循环调用多次。
- **根因**：不支持原生 tool_calls 的模型不理解 role:"tool" 消息，看到工具结果后以为自己还需要再调用一次。
- **修复**：工具循环中，Ollama 成功执行 write_file 后立即 `break`，不再继续调 API。同时自动显示"✅ 已完成编辑。"替代模型后续的冗长回复。
- **教训**：不能一概而论"不能 break early"——break 的时机要对。write_file 已经写入了就不需要再继续了，read_file 才需要继续让模型看到结果。

### 13. JSON 解析失败因 content 中含未转义双引号
- **现象**：模型输出的 `<tool_call>` 中 `"content":"...单纯的"欲望"..."` 含 ASCII 双引号，`JSON.parse` 报错 `Expected ',' or '}' after property value`。
- **根因**：E4B 模型未对 content 中的 `"` 进行 JSON 转义。
- **修复**：`parseToolCallsFromText` 的 `catch` 中增加手动字段提取 fallback:
  1. 正则提取 `"name":"xxx"`
  2. 从末尾提取 `"path":"xxx"`
  3. 从 `"content":"` 到 `","path"` 之间提取 content
  4. 将 `\\n` 替换为真实换行
- **教训**：E4B 输出的 JSON 不一定严格合法，必须准备手动提取的 fallback。这是最隐蔽的问题——模型输出了 `<tool_call>` 但解析静默失败，看起来像模型没调用工具。

### 14. DeepSeek V4 要求 tool 消息带 tool_call_id
- **现象**：HTTP 400，错误信息 `missing field tool_call_id`
- **根因**：DeepSeek V4 API 要求 tool 消息必须包含 `tool_call_id` 指向 assistant 的 tool_calls
- **修复**：三步改动：
  1. `types.ts` Message 接口增加 `tool_call_id` 和 `tool_calls` 字段
  2. `conversation.ts` 新增 `addAssistantMessageWithToolCalls()`，`addToolResult` 接受 toolCallId
  3. `view.ts` 收到 tool_calls 后，DeepSeek/Xiaomi 路径先调 `addAssistantMessageWithToolCalls` 再执行工具
- **注意**：Ollama 原生 API 不认识 tool_call_id / tool_calls 字段，必须跳过（`if (this.currentProvider !== "ollama")` 判断）

### 15. 不同提供商的 API 消息序列化差异
- **现象**：给 Ollama 传了 tool_calls 或 tool_call_id 字段导致 400
- **根因**：Ollama 原生 `/api/chat` 接口使用自有格式（tool_name），不支持 OpenAI 兼容格式的 tool_calls / tool_call_id
- **修复**：每个 API 层的消息序列化各自处理：
  - `api/ollama.ts`：只传 `role`、`content`、`tool_name`，不传 tool_call_id / tool_calls
  - `api/deepseek.ts`：传 `role`、`content`、`tool_call_id`（tool 消息）、`tool_calls`（assistant 消息）
  - `api/xiaomi.ts`：同上

## 切换到新本地模型的配置清单

如果以后换了一个 Ollama 本地模型（如 qwen、llama、gemma 其他版本），需要检查以下 3 点才能正常工作：

### 1. System Prompt — `getOllamaToolRules()` in `src/view.ts`
- 必须包含**多行 JSON 格式示例**（不是单行）
- 必须写明编辑流程（"用 write_file 写入 → 回复'已完成编辑'"）
- 必须说"不要询问确认"
- 规则放在 `buildSystemPrompt()` 末尾（不是开头）
- 参考当前 `getOllamaToolRules()` 的写法

### 2. JSON 解析兼容 — `parseToolCallsFromText()` in `src/view.ts`
- `catch` 块中必须有手动字段提取 fallback
- 如果新模型输出的 JSON 也不转义双引号，这个 fallback 是必须的
- 参考当前 `try { JSON.parse } catch { 手动提取 }` 的结构

### 3. 循环控制 — `sendMessage()` 工具循环
- Ollama 文本解析路径：检测到 write_file 后 `break
- 不要删除这个 break，否则模型会循环调用 write_file 多次

### 4. 消息序列化 — 各 API 层（`src/api/ollama.ts`）
- 如果新模型遇到 400 错误，检查是否传了 Ollama 不认识的字段
- Ollama 原生 API 只认 `role`、`content`、`tool_name`
- 不要在 Ollama 的请求中传 `tool_call_id` 或 `tool_calls`

## 工具调用流程（正确顺序）

### Ollama 路径（文本解析，非原生 tool_calls）
1. 用户发送消息，当前笔记内容自动附在 `<current_note>` 标签中
2. `sendRequestWithTools` 调用 Ollama API（带 tools 参数）
3. Ollama API 返回模型输出，期望包含 `<tool_call>` XML
4. 如果无原生 tool_calls，用 `parseToolCallsFromText` 从文本提取 `<tool_call>` 里的 JSON
5. JSON 解析失败时 fallback 到手动字段提取（处理未转义双引号）
6. 提取后 `stripToolCallText` 清理显示文本
7. `sendMessage` 工具循环：
   - `handleToolCalls` 执行工具 + 显示 UI
   - 工具结果用 `addToolResult`（role: "tool"）添加到对话历史
   - **如果执行了 write_file，立即 break**（否则模型会循环调用）
   - 否则继续调 API 让模型看到结果
8. break 后显示 "✅ 已完成编辑。"

### DeepSeek / Xiaomi 路径（原生 tool_calls）
1. 用户发送消息
2. `sendMessage` → `sendRequestWithTools` → 对应 API（带 tools 参数）
3. API 返回原生 `message.tool_calls` 字段
4. `sendMessage` 循环：
   - 先将 assistant 消息（含 tool_calls）加入对话历史（`addAssistantMessageWithToolCalls`）
   - `handleToolCalls` 执行工具，结果用 `addToolResult(role, content, toolCallId)`（role: "tool"）
   - 再次调用 API，模型根据工具结果生成回复
5. 若无 tool_calls，显示回复内容

## 代码规范
- 注释使用中文
- 工具调用场景不设 `num_predict`
- 工具执行结果全部用 `addToolResult`（role: "tool"）
- DeepSeek/Xiaomi 路径：tool 消息带 `tool_call_id`，assistant 消息带 `tool_calls`
- Ollama 路径：不传 `tool_call_id`，不传 `tool_calls`（Ollama 原生 API 不认识）
- 对话栏下拉框选项用 `dataset.provider` 映射回提供商，而不是靠 value 判断
- 用 `indexOf` + `slice` 替代 `replace` 处理动态文本
- Ollama 文本解析路径：write_file 执行后 `break`，read_file 后继续循环
