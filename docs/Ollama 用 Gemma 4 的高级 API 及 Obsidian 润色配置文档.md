###  Ollama 用 Gemma 4 的高级 API 及 Obsidian 润色配置文档
codeMarkdown

````
# Ollama Gemma 4 API 调用与 Obsidian 笔记改写配置指南

本指南面向知识管理人士、科研学者及开发者，详细介绍如何通过本地 **Ollama** 运行 Google 的 **Gemma 4** 架构模型，并实现与 **Obsidian** 笔记软件的无缝对接。提供最完整的本地 API 端口详解、配置超参数说明、多语言调用代码以及 Obsidian 热门 AI 插件对接模板。

---

## 一、 本地环境搭建与模型就绪

### 1.1 安装并启动 Ollama
请前往 [Ollama 官方网站](https://ollama.com) 下载适用于您系统的版本（macOS、Windows 或 Linux）并安装。安装完成后，Ollama 默认会在后台运行系统驻留程序，提供本地 API 端口：

- **默认 API 本地基址**: `http://localhost:11434`

### 1.2 下载拉取 Gemma 4 模型
打开您电脑上的终端（Terminal）或命令提示符（CMD），执行以下命令拉取并下载运行 Gemma 4：
```bash
ollama run gemma4
````

> 注：若您使用的是 Gemma 4 的不同参数尺寸（如 2B 轻量版、9B 标配版或 27B 高精度版），请更换对应的 Tag 标签执行拉取，例如：ollama run gemma4:2b 或 ollama run gemma4:27b。

---

## 二、 Ollama 核心 API 接口说明

Ollama 在本地暴露了两个最常用的生成类 POST API 路由：

1. **/api/generate**: 单次自动补全接口（适合简易快速批处理、纯文本改写）。
    
2. **/api/chat**: 对话格式补全接口（支持 System 角色信息、User 和 Assistant 多轮上下文，**推荐在 Obsidian 中应用以获得最佳角色掌控力**）。
    

### 2.1 单次补全接口 /api/generate

- **请求方法**: POST
    
- **接口路径**: http://localhost:11434/api/generate
    
- **请求标头**: Content-Type: application/json
    

#### 请求体参数 (JSON Payloads)

|   |   |   |   |   |
|---|---|---|---|---|
|参数名|接收类型|是否必填|默认值|详细作用及对笔记改写的影响|
|model|String|**是**|-|本地调用的模型标识，如 "gemma4" 或 "gemma4:9b"|
|prompt|String|**是**|-|灌入模型的提示请求，在改写场景中为：“改写指令+原始笔记”|
|system|String|否|-|系统级提示词，用于限制模型的语言风格和编辑输出规范|
|stream|Boolean|否|true|是否流式传输输出颗粒。若开发自动化脚本，建议设为 false|
|options|Object|否|-|高级超参数控制对象（详细字段见第三节）|

---

### 2.2 对话补全接口 /api/chat

- **请求方法**: POST
    
- **接口路径**: http://localhost:11434/api/chat
    
- **请求标头**: Content-Type: application/json
    

#### 请求体参数 (JSON Payloads)

|   |   |   |   |   |
|---|---|---|---|---|
|参数名|接收类型|是否必填|默认值|说明|
|model|String|**是**|-|调用的模型名称，如 "gemma4"|
|messages|Array|**是**|-|格式化消息序列数组，包含 { "role": "...", "content": "..." }|
|stream|Boolean|否|true|客户端逐词流式显示，Obsidian 交互建议开启，脚本分析设 false|
|options|Object|否|-|高级超参数选项|

codeJSON

```
[
  {
    "role": "system",
    "content": "你是一位拥有十多年编辑经验的 Zettelkasten 卡片盒整理学专家，擅长将口语整理为高精炼度的知识卡片。"
  },
  {
    "role": "user",
    "content": "帮我润色这段随笔，使用标准 Markdown 输出：昨天偶遇一个新名词叫作主动回忆..."
  }
]
```

---

## 三、 高级配置超参数 (options) 详解

在传入 API 请求对象的 "options" 属性中，可以精确调整 Gemma 4 本地运行的状态，有助于在**严谨润色**与**创意思前**获取最优解：

|   |   |   |   |   |
|---|---|---|---|---|
|参数名称|类型|改写推荐值|创意推荐值|参数功能说明|
|temperature|Float|**0.3**|**0.8**|**采样温度**。值越低输出越稳定严谨。学术整理建议设定为 0.3 或以下，避免模型逻辑虚构或跳跃。|
|top_p|Float|**0.9**|**0.95**|**核采样比例**。限制只考虑累加概率前 p% 的词，过滤无效语气助词和偏门语料。|
|num_ctx|Integer|**8192**|**4096**|**上下文窗口限制**（默认 2048）。改写、合并阅读超长个人笔记文档时，**请务必手动将其设定为 8192** 以上。|
|num_predict|Integer|**2048**|**2560**|**单次最大输出 Token 限制**。防止模型在润色过半时由于长度越界被强行砍掉尾部。|
|repeat_penalty|Float|**1.15**|**1.1**|**重复度惩罚系数**。较高的 penalty（如 1.15）能有效防止本地模型反复打印相似句式。|

---

## 四、 核心语言调用代码示例

### 4.1 cURL 命令行接口 (一次性响应测试)

在命令行中执行此指令，可快捷测定本地 Ollama Gemma 4 模型是否已准备就绪：

codeBash

```
curl http://localhost:11434/api/chat -H "Content-Type: application/json" -d '{
  "model": "gemma4",
  "messages": [
    {
      "role": "system",
      "content": "你是排版细节控。请为以下笔记添加中英文空格间隙，规范所有中文字符内的半角符号，输出精美列表。"
    },
    {
      "role": "user",
      "content": "我使用了ollama下的gemma4运行效果很好,它的端口是11434,目前正尝试在obsidian中使用。"
    }
  ],
  "stream": false,
  "options": {
    "temperature": 0.2,
    "num_ctx": 4096
  }
}'
```

---

### 4.2 JavaScript / TypeScript (Obsidian Templater 或 QuickAdd 动态脚本)

在 Obsidian 自定义插件机制脚本、QuickAdd 定制按钮中直接调用的 Fetch 处理：

codeJavaScript

```
async function rewriteNoteWithGemma4(noteText) {
  const SERVER_URL = "http://localhost:11434/api/chat";
  
  const payload = {
    model: "gemma4",
    messages: [
      {
        role: "system",
        content: "你是一个优秀的数字卡片盒整理专家。请用中文修改润色随笔，将其精炼划分成“核心概念”、“机制剖析”、“关联引申”三段优雅架构。"
      },
      {
        role: "user",
        content: noteText
      }
    ],
    stream: false, // 脚本处理推荐设定 false，一次性拿到结果
    options: {
      temperature: 0.3,
      num_ctx: 8192,
      num_predict: 2048,
      repeat_penalty: 1.15
    }
  };

  try {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP 通讯故障，状态码: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content; // 返回润色完毕的成品文本
  } catch (error) {
    console.error("调用本地 Gemma 4 失败:", error);
    return null;
  }
}
```

---

### 4.3 Python (本地笔记自动化批处理与同步脚本)

编写自动化脚本批量扫描本地 Obsidian 库，重构优化指定的 .md 原始笔记：

codePython

```
import requests
import json

def improve_note_via_gemma4(source_text: str) -> str:
    api_url = "http://localhost:11434/api/chat"
    headers = {
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "gemma4",
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是一位专业的学术审稿人。请将用户的零散随笔，置换为学术逻辑性强、"
                    "词汇精炼且格式分明的 Markdown 科学表述。绝不篡改人名与数据事实，直接输出重构内容。"
                )
            },
            {
                "role": "user",
                "content": f"请润色以下原始笔记段落：\n\n{source_text}"
            }
        ],
        "stream": False,
        "options": {
            "temperature": 0.2,
            "num_ctx": 8192
        }
    }
    
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        result_json = response.json()
        return result_json['message']['content']
    except Exception as e:
        return f"[Error] 本地 API 调用异常失败: {str(e)}"

# 测试用例
if __name__ == "__main__":
    draft = "艾宾浩斯忘的速度特别快，二十多分钟就能忘一大半，所以必须利用间隔重复，多背几次才不会遗忘。"
    print(improve_note_via_gemma4(draft))
```

---

## 五、 Obsidian 热门 AI 插件无缝对接指南

### 5.1 Obsidian Copilot 插件对接

Copilot 插件提供了绝佳的侧边栏对话和笔记选区右键改写功能。

1. 进入 Obsidian 的设置 ➔ **社区插件** ➔ 找到 **Copilot**。
    
2. 将 **Default Provider** 改为 Ollama。
    
3. **Ollama URL** 保持默认值 http://localhost:11434。
    
4. 在模型激活（Active Model）菜单旁点击 **刷新 (Refresh)** 图标。
    
5. 在下拉选项卡中选择：gemma4（此时确保您本地终端已成功运行过一次 ollama run gemma4 保持服务在线）。
    
6. 配置下方的 **Context Window Size (Token)** 为 8192。
    

---

### 5.2 Obsidian Text Generator 插件对接步骤

Text Generator 被广泛用于在正在编辑的笔记段落中通过自定义模板原位快速生成：

1. 打开 **Text Generator** 设置选板。
    
2. 设定 **LLM Provider** 为 Ollama。
    
3. 配置 **Base Path** 指向 http://localhost:11434。
    
4. 设定模型 **Model** 文本框为 gemma4。
    
5. 在 Obsidian 笔记本里新建一个模板文件。例如：templates/prompts/Gemma 4 笔记润色.md：
    
    codeMarkdown
    
    ```
    ---
    promptId: gemma4-reformat
    name: Gemma 4 笔记大纲润色与矫正
    description: 结构化理清笔记，排版规范与添加中英文空格间隙
    ---
    system: 你是一位拥有精湛写作经验、强文字洁癖的 Obsidian 极致排版师。
    
    请对我下面选中的笔记段落字句展开重新矫正与结构化：
    {{selectedText}}
    ```
    

---

## 六、 经典 Obsidian 笔记优化 System Prompt (提示词) 调强调解

在您的 APP 开发或配置自定义插件按钮时，直接替换以下的高阶 System 提示词组合，可以产生截然不同、极致针对性的润色效果：

### 6.1 【学术润色 · 标准论文重组风格】

- **用途**：将学术随笔、突发灵感、讲座录音整理快速归拢。
    
- **Prompt**：
    
    codeMarkdown
    
    ```
    你是一位杰出的学术助手、科研编辑兼数字卡片专家。
    请将用户输入的一组零散的学术笔记、会议记录进行重构。
    要求：
    1. **学术化表述**：用中性、理性、结构化的科学语言替换口语，提升句式流畅度。
    2. **逻辑分层**：使用 Markdown 的二级标题 (##) 和列表 (-) 进行清晰划分，建立脉络。
    3. **概念抽取**：遇到专业名词，自动在旁用括号标注对应的标准英文名词与精简定义。
    4. **事实一致**：百分之百保留原句里的论文引用数据、人名与实际事实，严禁伪造。
    5. **拒绝废话**：不要任何开场白和尾注，直接给出最终重绘完毕的 Markdown 文本。
    ```
    

