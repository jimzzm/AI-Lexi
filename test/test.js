#!/usr/bin/env node
/**
 * 工具调用流程测试 - 验证核心逻辑
 */

// ========== stripToolCallText ==========
function stripToolCallText(text) {
  let result = text;
  const codeBlockPatterns = ["```json\n", "```javascript\n", "```js\n", "```\n", "```"];
  for (const fence of codeBlockPatterns) {
    let cbIdx = result.indexOf(fence + "<tool_call>");
    while (cbIdx !== -1) {
      const cbEnd = result.indexOf("```", cbIdx + fence.length + 11);
      result = cbEnd !== -1 ? result.slice(0, cbIdx) + result.slice(cbEnd + 3) : result.slice(0, cbIdx);
      cbIdx = result.indexOf(fence + "<tool_call>");
    }
  }
  let idx = result.indexOf("<tool_call>");
  if (idx !== -1) {
    const endIdx = result.indexOf("</tool_call>", idx);
    result = endIdx !== -1 ? result.slice(0, idx) + result.slice(endIdx + "</tool_call>".length) : result.slice(0, idx);
  }
  idx = result.indexOf("<tool_call");
  if (idx !== -1) {
    const endIdx = result.indexOf(">", idx);
    if (endIdx !== -1) result = result.slice(0, idx) + result.slice(endIdx + 1);
  }
  result = result.replace(/\n{3,}/g, "\n\n").trim();
  return result;
}

// ========== parseToolCallsFromText ==========
function parseToolCallsFromText(text) {
  const toolCalls = [];
  const seen = new Set();
  const addToolCall = (name, args, originalText) => {
    const key = `${name}:${JSON.stringify(args)}`;
    if (seen.has(key)) return;
    seen.add(key);
    toolCalls.push({ function: { name, arguments: JSON.stringify(args) }, originalText });
  };
  const nameMap = { Read: "read_file", Write: "write_file", read: "read_file", write: "write_file" };
  const toolCallRegex = /<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g;
  let tcMatch;
  while ((tcMatch = toolCallRegex.exec(text)) !== null) {
    try {
      let raw = tcMatch[1].trim().replace(/^```(?:json|javascript)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;
      const json = JSON.parse(jsonMatch[0]);
      const toolName = nameMap[json.name] || json.name;
      let args = {};
      if (json.arguments && typeof json.arguments === "object") args = { ...json.arguments };
      else { if (json.path) args.path = json.path; if (json.content) args.content = json.content; }
      if (toolName) addToolCall(toolName, args, tcMatch[0]);
    } catch (e) {}
  }
  return toolCalls;
}

// ========== 测试用例 ==========
const tests = [
  {
    name: "E4B场景1: 输出完整重写 + tool_call",
    content: "# 优化后的内容\n\n这是润色后的完整修改...\n\n<tool_call>\n{\"name\": \"write_file\", \"arguments\": {\"path\": \"test.md\", \"content\": \"new\"}}\n</tool_call>",
    expectTools: 1,
    problemText: "优化后的内容",
  },
  {
    name: "E4B场景2: 只输出 tool_call",
    content: "<tool_call>\n{\"name\": \"read_file\", \"arguments\": {\"path\": \"test.md\"}}\n</tool_call>",
    expectTools: 1,
    problemText: null,
  },
  {
    name: "E4B场景3: 截断的 tool_call",
    content: "我来读取：\n\n<tool_call>\n{\"name\": \"read_file\", \"arguments\": {\"path\": \"test.md\"}}",
    expectTools: 1,
    problemText: "我来读取",
  },
  {
    name: "E4B场景4: 不调用工具，直接输出重写",
    content: "# 润色后的笔记\n\n这是完整的润色内容...",
    expectTools: 0,
    problemText: "润色后的笔记",
  },
  {
    name: "E4B场景5: 解释文字 + tool_call",
    content: "好的，我来帮你修改。\n\n<tool_call>\n{\"name\": \"read_file\", \"arguments\": {\"path\": \"test.md\"}}\n</tool_call>",
    expectTools: 1,
    problemText: "好的，我来帮你修改",
  },
];

console.log("========== 工具调用解析测试 ==========\n");
let pass = 0, fail = 0;

for (const t of tests) {
  const tools = parseToolCallsFromText(t.content);
  const clean = stripToolCallText(t.content);
  const toolsOk = tools.length === t.expectTools;
  const hasProblem = t.problemText && clean.includes(t.problemText);

  console.log(`--- ${t.name} ---`);
  console.log(`  工具数: ${tools.length}/${t.expectTools} ${toolsOk ? "✅" : "❌"}`);
  console.log(`  清理后: "${clean.substring(0, 60)}${clean.length > 60 ? "..." : ""}"`);
  if (hasProblem) console.log(`  ⚠️  问题: "${t.problemText}" 仍显示在对话栏`);

  const ok = toolsOk && !hasProblem;
  console.log(`  ${ok ? "✅ PASS" : "❌ FAIL"}\n`);
  ok ? pass++ : fail++;
}

console.log(`结果: ${pass}通过, ${fail}失败`);

// ========== 模拟完整流程 ==========
console.log("\n========== 模拟 sendMessage 流程 ==========\n");

function simulate(modelContent, hasNativeTools) {
  let display = "";
  let executed = [];

  let response = {
    success: true,
    content: modelContent,
    toolCalls: hasNativeTools
      ? [{ function: { name: "read_file", arguments: '{"path":"test.md"}' } }]
      : parseToolCallsFromText(modelContent),
  };

  let loops = 0;
  while (response.success && response.toolCalls?.length > 0 && loops < 5) {
    loops++;
    for (const tc of response.toolCalls) executed.push(tc.function.name);
    response = { success: true, content: "已完成编辑。", toolCalls: [] };
  }

  if (response.content?.trim()) display = stripToolCallText(response.content);
  return { display, executed, loops };
}

// A: 原生 tool_calls
console.log("A: 原生 tool_calls (read→write)");
const a = simulate("", true);
console.log(`  工具: ${a.executed.join(", ")} | 显示: "${a.display}" | ${a.executed.length === 2 ? "✅" : "❌"}\n`);

// B: content 中 tool_call + 冗长文字
console.log("B: content中tool_call + 冗长文字");
const b = simulate("# 润色后\n\n内容...\n\n<tool_call>\n{\"name\":\"write_file\",\"arguments\":{\"path\":\"t.md\",\"content\":\"x\"}}\n</tool_call>", false);
console.log(`  工具: ${b.executed.join(", ")} | 显示: "${b.display}"`);
console.log(`  ⚠️ 即使工具执行了，"润色后"仍显示\n`);

// C: 不调用工具
console.log("C: 不调用工具，直接输出重写");
const c = simulate("# 润色笔记\n\n完整内容...", false);
console.log(`  工具: ${c.executed.join(", ") || "(无)"} | 显示: "${c.display.substring(0, 40)}..."`);
console.log(`  ❌ 笔记未被编辑\n`);
