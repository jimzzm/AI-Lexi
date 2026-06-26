---
title: 豆包
source: https://www.doubao.com/chat/38430403484679682
author:
published:
created: 2026-06-23
description: Seedance 2.0 视频生成模型现已全面接入豆包，现在登录即可免费使用！
tags:
  - clippings
---

## 火山引擎 API 调用零基础保姆级教程（豆包 + 视频解析全搞定）

先帮你理清最容易乱的 **产品结构** ，一句话记死：

> 所有 AI 大模型（豆包、视频理解、图像生成等）的 API， **全部统一在「火山方舟（ARK）」平台** 管理，不用在火山引擎各个产品页乱找！语音类（合成 / 识别）单独在「豆包语音」控制台，其他 AI 能力全在火山方舟。

---

## 一、前期准备：3 步搞定调用权限（必须做）

### 1\. 注册账号 + 实名认证

1. 打开火山引擎官网： [https://www.volcengine.com/](https://link.wtturl.cn/?target=https%3A%2F%2Fwww.volcengine.com%2F&scene=im&aid=497858&lang=zh "autolink")
2. 点击右上角「注册」，用手机号注册账号
3. 注册后进入控制台，点击右上角头像→「实名认证」，选择个人认证（免费，几分钟搞定）， **不认证完全无法调用 API**

### 2\. 进入火山方舟（核心入口，别走错）

直接打开这个链接（收藏好）： [https://console.volcengine.com/ark/](https://link.wtturl.cn/?target=https%3A%2F%2Fconsole.volcengine.com%2Fark%2F&scene=im&aid=497858&lang=zh "autolink")

> 新用户会自动赠送免费调用额度（豆包 + 视频理解都有），足够你测试用，不用先花钱

### 3\. 创建 2 个核心凭证（调用必须）

#### ① 创建 API Key（你的调用密码）

1. 火山方舟左侧菜单→点击「API Key 管理」
2. 点击「创建 API Key」，输入名称（比如「我的测试密钥」）
3. 创建后 **立即复制保存** ！这个密钥只显示一次，丢了只能重新创建

> ❌ 避坑：这个是火山方舟的 API Key，不是火山引擎的 AK/SK！调用时用 `Bearer 你的API Key` 格式，不要用 AK/SK 认证

#### ② 创建推理接入点（Endpoint，模型的唯一标识）

每个模型都需要单独创建接入点，相当于给模型开一个调用入口：

1. 火山方舟左侧菜单→点击「在线推理」→「推理接入点」
2. 点击右上角「创建推理接入点」
3. 选择你要调用的模型：
	- 调用豆包聊天：选 `Doubao-lite-128k` （免费额度多，适合测试）或 `Doubao-1.5-pro-256k` （能力更强）
	- 调用视频解析：选 `doubao-seed-2-0-lite-260215` （视频理解默认推荐，支持音视频联合分析）
4. 其他默认，点击「确定」，创建后会得到一个 `ep-` 开头的接入点 ID（比如 `ep-20260613xxxxxx` ），这个就是调用时的 `model` 参数

---

## 二、调用豆包大语言模型 API（复制就能用）

### 核心参数（记死这 3 个）

表格

| 参数                | 值                                                           | 说明                 |
| ----------------- | ----------------------------------------------------------- | ------------------ |
| 请求地址              | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | 固定不变               |
| 请求头 Authorization | `Bearer 你的API Key`                                          | 替换成你刚才复制的 API Key  |
| body 里的 model     | `ep-xxxxxx`                                                 | 替换成你创建的豆包模型的接入点 ID |

### 示例 1：Python 代码（最常用）

先安装依赖： `pip install openai`

```python
from openai import OpenAI

# 初始化客户端（只改这3个地方！）
client = OpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key="你刚才复制的API Key"
)

# 调用聊天接口
response = client.chat.completions.create(
    model="你的豆包接入点ID（ep-开头）",
    messages=[
        {"role": "user", "content": "你好，帮我写一个Python的冒泡排序代码"}
    ],
    temperature=0.7,  # 数值越低回答越严谨，越高越有创意
    max_tokens=1024   # 最大输出字数
)

# 打印结果
print(response.choices[0].message.content)
```

### 示例 2：curl 命令（不用装环境，直接测试）

把下面的 `你的API Key` 和 `你的接入点ID` 替换后，直接在终端运行：

```bash
curl https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的API Key" \
  -d '{
    "model": "你的豆包接入点ID",
    "messages": [
      {"role": "user", "content": "你好，介绍一下你自己"}
    ]
  }'
```

---

## 三、调用视频解析 / 视频理解 API（完整步骤）

视频解析用的是 **豆包 Seed 多模态模型** ，支持 3 小时内的长视频，能做内容总结、问答、高光提取、字幕识别等，默认推荐模型： `doubao-seed-2-0-lite-260215`

> ❗ 注意：视频处理是 **异步** 的，分 2 步：先提交任务→再轮询结果

### 支持的视频解析模型对比（按需选）

表格

| 模型名称 | 定位 | 特点 | 价格 |
| --- | --- | --- | --- |
| `doubao-seed-2-0-lite-260215` | 通用推荐 | 支持音视频联合分析，平衡效果和速度 | 便宜，适合大多数场景 |
| `doubao-seed-2-0-pro-260215` | 高精度 | 复杂推理、细节识别更强 | 贵，适合高要求场景 |
| `doubao-seed-2-0-mini-260428` | 轻量快速 | 简单摘要、快速处理 | 最便宜 |

### 步骤 1：提交视频解析任务

#### 核心参数

表格

| 参数 | 值 | 说明 |
| --- | --- | --- |
| 请求地址 | `https://operator.las.cn-beijing.volces.com/api/v1/submit` | 固定 |
| 请求头 Authorization | `Bearer 你的API Key` | 和豆包用同一个 API Key |
| video\_url | 视频的公开下载链接 | 必须是 http/https 开头，服务端能直接访问的链接（比如你上传到腾讯云 / 阿里云 OSS 的公开视频） |

#### curl 提交任务示例（复制替换即可）

```bash
curl --location "https://operator.las.cn-beijing.volces.com/api/v1/submit" \
--header "Content-Type: application/json" \
--header "Authorization: Bearer 你的API Key" \
--data '{
 "operator_id": "las_long_video_understand",
 "operator_version": "v1",
 "data": {
 "video_url": "你的视频公开链接（比如https://example.com/test.mp4）",
 "task_template": "general_video_captioning", 
 "model_name": "doubao-seed-2-0-lite-260215"
 }
}'
```

> task\_template 可选：
> 
> - `general_video_captioning` ：生成视频整体文字描述（默认）
> - `dense_video_captioning` ：生成带时间戳的结构化片段描述
> - `video_audio_understanding` ：音视频联合分析（同时看画面 + 听语音）

提交成功后会返回 `task_id` （比如 `task-20260613xxxxxx` ），保存好这个 ID，下一步查结果用。

### 步骤 2：轮询查询解析结果

用刚才得到的 `task_id` 查询结果，视频越长需要的时间越久（1 分钟视频大概等 5-10 秒）：

```bash
curl --location "https://operator.las.cn-beijing.volces.com/api/v1/poll" \
--header "Content-Type: application/json" \
--header "Authorization: Bearer 你的API Key" \
--data '{
 "operator_id": "las_long_video_understand",
 "operator_version": "v1",
 "task_id": "你刚才得到的task_id"
}'
```

当返回的 `task_status` 变成 `COMPLETED` 时， `final_summary` 字段就是视频解析的结果，还有 token 用量、视频时长等信息。

---

## 四、新手最容易踩的 5 个坑（必看！）

1. ❌ 用错密钥：火山方舟用的是 **API Key（Bearer 开头）** ，不是火山引擎控制台的 AK/SK！90% 的调用失败都是这个原因
2. ❌ 没创建推理接入点：不能直接写模型名称（比如不能写 `Doubao-lite-128k` ），必须用你自己创建的 `ep-` 开头的接入点 ID
3. ❌ 地址写错：豆包聊天的 base\_url 是 `ark.cn-beijing.volces.com` ，视频算子的是 `operator.las.cn-beijing.volces.com` ，不要混
4. ❌ 视频链接不对：视频必须是 **公开可直接下载** 的链接，不能是需要登录的网盘链接、本地文件路径
5. ❌ 视频理解不等结果：提交任务后要轮询，不是立即返回结果，不要以为调用失败了

---

## 五、怎么查用量和费用？

1. 火山方舟左侧→「费用中心」→「账单管理」，可以看所有 API 调用的用量和费用
2. 新用户免费额度用完后，会自动按量计费，豆包 lite 版 1 百万 tokens 只要几块钱，非常便宜

如果还有哪里不懂，直接说具体步骤，我再给你拆解！