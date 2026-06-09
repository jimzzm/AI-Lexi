---
title: "Anthropic API | DeepSeek API Docs"
source: "https://api-docs.deepseek.com/zh-cn/guides/anthropic_api"
author:
published:
created: 2026-06-07
description: "为了满足大家对 Anthropic API 生态的使用需求，我们的 API 新增了对 Anthropic API 格式的支持，其 base_url 为 https://api.deepseek.com/anthropic。"
tags:
  - "clippings"
---
## Anthropic API

为了满足大家对 Anthropic API 生态的使用需求，我们的 API 新增了对 Anthropic API 格式的支持，其 `base_url` 为 `https://api.deepseek.com/anthropic` 。

通过简单的配置，即可将 DeepSeek 的能力，接入到 Anthropic API 生态中。

---

## 将 DeepSeek 模型接入 Claude Code

请参考 [接入 Agent 工具](https://api-docs.deepseek.com/zh-cn/guides/coding_agents)

## 通过 Anthropic API 调用 DeepSeek 模型

1. 安装 Anthropic SDK

```markdown
pip install anthropic
```

2. 配置环境变量

```markdown
export ANTHROPIC_BASE_URL=https://api.deepseek.com/anthropic
export ANTHROPIC_API_KEY=${YOUR_API_KEY}
```

3. 调用 API

```markdown
import anthropic

client = anthropic.Anthropic()

message = client.messages.create(
    model="deepseek-v4-pro",
    max_tokens=1000,
    system="You are a helpful assistant.",
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "text",
                    "text": "Hi, how are you?"
                }
            ]
        }
    ]
)
print(message.content)
```

**注意** ：当您给 DeepSeek 的 Anthropic API 传入不支持的模型名时，API 后端会自动将其映射到 `deepseek-v4-flash` 模型。

---

## Anthropic 模型映射

您在使用 Anthropic API 时，我们会对您传入的 claude 模型名进行映射：

- claude-opus 开头的模型，会映射到 deepseek-v4-pro
- claude-haiku、claude-sonnet 开头的模型，会映射到 deepseek-v4-flash

通过这样的映射，您在使用新版 Claude Desktop APP 的 developer 模式时，可以绕过 APP 对模型名的限制，只需改动 base\_url 和 api\_key，即可在其中接入 DeepSeek 模型。

---

## Anthropic API 兼容性细节

### HTTP Header

| Field | Support Status |
| --- | --- |
| anthropic-beta | Ignored |
| anthropic-version | Ignored |
| x-api-key | Fully Supported |

### Simple Fields

| Field | Support Status |
| --- | --- |
| model | Use DeepSeek Model Instead |
| max\_tokens | Fully Supported |
| container | Ignored |
| mcp\_servers | Ignored |
| metadata | `user_id` is supported, others are ignored   Please refer to [Rate Limit & Isolation](https://api-docs.deepseek.com/zh-cn/quick_start/rate_limit) for more information about `user_id` parameter. |
| service\_tier | Ignored |
| stop\_sequences | Fully Supported |
| stream | Fully Supported |
| system | Fully Supported |
| temperature | Fully Supported (range \[0.0 ~ 2.0\]) |
| thinking | Supported (`budget_tokens` is ignored) |
| output\_config | Only `effort` is supported |
| top\_k | Ignored |
| top\_p | Fully Supported |

### Tool Fields

#### tools

| Field | Support Status |
| --- | --- |
| name | Fully Supported |
| input\_schema | Fully Supported |
| description | Fully Supported |
| cache\_control | Ignored |

#### tool\_choice

| Value | Support Status |
| --- | --- |
| none | Fully Supported |
| auto | Supported (`disable_parallel_tool_use` is ignored) |
| any | Supported (`disable_parallel_tool_use` is ignored) |
| tool | Supported (`disable_parallel_tool_use` is ignored) |

### Message Fields

<table><tbody><tr><th>Field</th><th>Variant</th><th>Sub-Field</th><th>Support Status</th></tr><tr><td rowspan="23">content</td><td>string</td><td></td><td>Fully Supported</td></tr><tr><td rowspan="3">array, type="text"</td><td>text</td><td>Fully Supported</td></tr><tr><td>cache_control</td><td>Ignored</td></tr><tr><td>citations</td><td>Ignored</td></tr><tr><td>array, type="image"</td><td></td><td>Not Supported</td></tr><tr><td>array, type = "document"</td><td></td><td>Not Supported</td></tr><tr><td>array, type = "search_result"</td><td></td><td>Not Supported</td></tr><tr><td>array, type = "thinking"</td><td></td><td>Supported</td></tr><tr><td>array, type="redacted_thinking"</td><td></td><td>Not Supported</td></tr><tr><td rowspan="4">array, type = "tool_use"</td><td>id</td><td>Fully Supported</td></tr><tr><td>input</td><td>Fully Supported</td></tr><tr><td>name</td><td>Fully Supported</td></tr><tr><td>cache_control</td><td>Ignored</td></tr><tr><td rowspan="4">array, type = "tool_result"</td><td>tool_use_id</td><td>Fully Supported</td></tr><tr><td>content</td><td>Fully Supported</td></tr><tr><td>cache_control</td><td>Ignored</td></tr><tr><td>is_error</td><td>Ignored</td></tr><tr><td>array, type = "server_tool_use"</td><td></td><td>Supported</td></tr><tr><td>array, type = "web_search_tool_result"</td><td></td><td>Supported</td></tr><tr><td>array, type = "code_execution_tool_result"</td><td></td><td>Not Supported</td></tr><tr><td>array, type = "mcp_tool_use"</td><td></td><td>Not Supported</td></tr><tr><td>array, type = "mcp_tool_result"</td><td></td><td>Not Supported</td></tr><tr><td>array, type = "container_upload"</td><td></td><td>Not Supported</td></tr></tbody></table>