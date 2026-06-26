---
title: DeepSeek
source: https://chat.deepseek.com/a/chat/s/f432dc27-6f9c-4952-95c3-92eb72e63e24
author:
published:
created: 2026-06-23
description: DeepSeek AI
tags:
  - clippings
---
### DeepSeek API 稳定版开发指南（v1 标准端点）

本文档适用于基于 `https://api.deepseek.com/v1` 端点的稳定功能开发。所有功能均已在生产环境中经过验证，适合构建正式应用。

---

#### 1. 基础配置

- **API Base URL**: `https://api.deepseek.com` (SDK 中通常无需显式指定，默认即为 v1 版本)
    
- **认证方式**: 通过 `api_key` 进行认证
    
- **核心模型**: `deepseek-v4-pro` (或其他可用模型)
    
```
·python

from openai import OpenAI
client = OpenAI(
    api_key="<your-api-key>",
    # base_url 使用默认值即可，无需指定 /v1 或 /beta
)
```

---


#### 2. 多轮对话

API 是无状态的，每次请求需传递完整对话历史。

**关键参数**: `messages` (消息列表)

**实现流程**:

1. 构建包含历史消息的 `messages` 列表。
    
2. 发送请求，获取模型回复。
    
3. 将模型回复追加到 `messages` 中。
    
4. 添加新的用户消息，重复步骤 2。
    

**示例代码**:
```
python

from openai import OpenAI
client = OpenAI(api_key="<your-api-key>")
# 第一轮
messages = [{"role": "user", "content": "What's the highest mountain?"}]
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages
)
messages.append(response.choices[0].message)
# 第二轮
messages.append({"role": "user", "content": "What's the second?"})
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages
)
print(response.choices[0].message.content)
```

---

#### 3. JSON 输出

强制模型输出合法的 JSON 字符串。

**关键参数**:

- `response_format`: `{"type": "json_object"}`
    
- **Prompt 要求**: 必须在 System 或 User Prompt 中包含 `json` 字样，并提供输出格式示例。
    
- `max_tokens`: 需合理设置，确保 JSON 完整输出。
    

**注意事项**:

- 模型偶尔可能返回空 `content`，可调整 Prompt 缓解。
    

**示例代码**:
```
python

import json
from openai import OpenAI
client = OpenAI(api_key="<your-api-key>")
system_prompt = """
Parse the user's question and answer into JSON format.
EXAMPLE INPUT: "Which is the highest mountain? Mount Everest."
EXAMPLE OUTPUT: {"question": "...", "answer": "..."}
"""
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": "Which is the longest river? The Nile."}
    ],
    response_format={"type": "json_object"}
)
print(json.loads(response.choices[0].message.content))
```

---

#### 4. 工具调用 (Tool Calls)

允许模型调用外部函数。

**关键参数**:

- `tools`: 定义可用函数列表 (包含 `name`, `description`, `parameters` (JSON Schema))
    

**工作流程**:

1. 用户提问。
    
2. 模型返回 `tool_calls` (包含函数名和参数)。
    
3. 用户执行相应函数，获得结果。
    
4. 将结果以 `role: "tool"` 的消息传回给模型。
    
5. 模型根据结果生成最终回答。
    

**示例代码**:
```
python

from openai import OpenAI
client = OpenAI(api_key="<your-api-key>")
tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Get weather of a location.",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {"type": "string", "description": "City name"}
            },
            "required": ["location"]
        }
    }
}]
messages = [{"role": "user", "content": "How's the weather in Hangzhou?"}]
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    tools=tools
)
tool_call = response.choices[0].message.tool_calls[0]
# 模拟执行函数
result = "24℃"  # 实际应调用 get_weather("Hangzhou")
# 将结果传回模型
messages.append(response.choices[0].message)
messages.append({
    "role": "tool",
    "tool_call_id": tool_call.id,
    "content": result
})
final_response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    tools=tools
)
print(final_response.choices[0].message.content)
```

---

#### 5. 思考模式 (Thinking Mode)

模型先输出思维链 (`reasoning_content`) 再给出最终回答 (`content`)，可提升复杂问题准确性。

**关键参数**:

- **启用**: `extra_body={"thinking": {"type": "enabled"}}`
    
- **思考强度**: `reasoning_effort="high"` (或 `"max"`)
    
- **不兼容参数**: `temperature`, `top_p`, `presence_penalty`, `frequency_penalty` (设置不生效)
    

**多轮对话中的拼接规则**:

- **无工具调用时**: 之前的 `reasoning_content` **不需要** 回传给 API，可直接丢弃。
    
- **有工具调用时**: 整个工具调用轮次的 `reasoning_content` **必须** 在后续请求中完整回传，否则 API 会返回 400 错误。
    

**示例代码 (无工具调用)**:
```
python

from openai import OpenAI
client = OpenAI(api_key="<your-api-key>")
messages = [{"role": "user", "content": "9.11 vs 9.8, which is greater?"}]
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)
# 获取思维链和回答
print("Reasoning:", response.choices[0].message.reasoning_content)
print("Answer:", response.choices[0].message.content)
# 下一轮对话：只需追加最终回答，无需回传 reasoning_content
messages.append({"role": "assistant", "content": response.choices[0].message.content})
messages.append({"role": "user", "content": "What about 9.11 and 9.9?"})
# ... 继续下一轮

**示例代码 (有工具调用)**:  
（完整示例可参考原文档，核心在于每次追加 `response.choices[0].message` 时，它会自动携带 `reasoning_content`，在后续请求中必须保持该字段不被删除。）
```
---

#### 6. 上下文硬盘缓存

自动开启，无需配置。可根据重复前缀加速响应并降低成本。

**查看命中情况**: 在 API 返回的 `usage` 字段中查看:

- `prompt_cache_hit_tokens`: 命中缓存的 token 数
    
- `prompt_cache_miss_tokens`: 未命中的 token 数
    

**命中规则**:

- 后续请求需完整匹配之前请求生成的“缓存前缀单元”才能命中。
    
- 系统会智能识别公共前缀并落盘。
    

**注意事项**:

- 缓存是“尽力而为”，不保证 100% 命中。
    
- 输出仍受随机性参数 (`temperature` 等) 影响，效果与不使用缓存一致。
    

---

#### 7. 通用最佳实践

1. **Base URL**: 稳定版开发**无需修改** `base_url`，SDK 默认指向正确端点。
    
2. **多轮对话**: 始终传递完整 `messages` 列表。
    
3. **JSON 输出**: 务必在 Prompt 中包含 `json` 和格式示例。
    
4. **思考模式**: 开启后不要设置 `temperature` 等参数；有工具调用时必须回传 `reasoning_content`。
    
5. **缓存优化**: 将不变的系统指令和常用文档放在对话开头，有利于提高缓存命中率。
    
6. **错误处理**: 对于工具调用等场景，建议添加异常捕获逻辑。