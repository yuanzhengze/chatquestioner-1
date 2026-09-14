import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { STAGE_ASKS_TITLE } from "./stages.js";

const HOST_COMMON = `
[小程序宿主适配 —— 用户永远看不到本段]

你现在跑在 NewBee 微信小程序里，不是 Cursor / Claude Code。

- 不要调用 AskQuestion、AskUserQuestion，也不要提这些工具名。
- 不要往磁盘写 {游戏名}-gdd.md。系统会根据你提交的 state_delta 渲染结果页并处理分享。
- 不要对用户提起题库、问法参考、阶段编号、完整度清单、SKILL.md、第几轮。
`.trim();

const HOST_GUIDE = `
[引导模式 · 本宿主]

同意门已由系统处理。禁止再问要不要走这个流程。下一句必须已经在聊他的创意。

每一轮澄清把 2–3 个实质设计方向放进 JSON options（id 为 A/B/C）。第四项如果要给，也必须是可玩方向。
禁止把「我有其他想法 / 自己输入 / 直接告诉我你的脑洞 / Other」做成选项。用户打字框就是开放口。
禁止只在人话里写方向却不放进 options。人话只保留共情和一个收敛提问。

必须把本轮新确认的信息写入 state_delta 指定键，不要只放在心里。
本轮只问系统附上的那一节 asks，禁止提前使用「收敛确认」里的暂定名 / Pitch 模板。
完整度缺口还在时禁止输出「暂定游戏名 / 概念总结 / 一句话亮点」，继续问当前节。一旦人话里出现概念总结，同一轮必须把 workingTitle、pitch、循环、差异化、mechanics、winRule 写入 state_delta。口头总结这一轮宿主还不出文档。
用户点「确认总结，生成设计文档」或说「现在就生成 / 确认总结、生成最终文档」时：宿主会出带缺口的草稿；你仍要继续问缺口，不要宣布结束、不要说去开发。
`.trim();

const FREEFORM_PROMPT = `
你是 NewBee。用户选择了不走创意引导采访。

职责：听他说话，只把能确定的设计信息写入 state_delta。不要连珠追问，不要投喂 2–4 个方向，不要给 options，不要催他走流程。
若他主动问你想法，可以短答，仍每轮最多一个问题。
不要写磁盘、不要提内部文件名。
`.trim();

export function stripFrontmatter(md: string): string {
  return md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
}

function readIfExists(dir: string, name: string): string {
  const p = resolve(dir, name);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8");
}

function splitAsksSections(md: string): { title: string; body: string }[] {
  const lines = md.split(/\r?\n/);
  const sections: { title: string; body: string }[] = [];
  let title = "";
  let body: string[] = [];
  const push = () => {
    if (title || body.some((l) => l.trim())) {
      sections.push({ title, body: body.join("\n").trim() });
    }
  };
  for (const line of lines) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      push();
      title = m[1].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  push();
  return sections;
}

/** 只投放当前阶段对应的 asks 节 + 选项纪律，避免模型提前抄收敛模板。 */
export function asksSliceForStage(asksMd: string, stage: number): string {
  if (!asksMd.trim()) return "";
  const sections = splitAsksSections(asksMd);
  const want = STAGE_ASKS_TITLE[stage] || "";
  const preamble = sections.find((s) => !s.title)?.body || "";
  const current = sections.find((s) => s.title === want);
  const discipline = sections.find((s) => s.title.includes("选项编写"));
  const parts: string[] = [];
  const intro = preamble.trim();
  if (intro) parts.push(intro);
  parts.push("本轮只使用下面这一节。其他节（含「收敛确认」）这轮不要用。");
  if (current) parts.push(`## ${current.title}\n\n${current.body}`);
  if (discipline) parts.push(`## ${discipline.title}\n\n${discipline.body}`);
  return parts.join("\n\n");
}

/** stage<8 时去掉 SKILL「收敛与落盘」模板，避免模型提前抄暂定名。 */
export function dropSkillConvergence(skill: string, stage: number): string {
  if (stage >= 8) return skill;
  return skill.replace(/\r?\n## 7\. 收敛与落盘[\s\S]*$/, "\n");
}

export interface ClarifyPromptOpts {
  skillDir: string;
  mode: "guide" | "freeform";
  stage: number;
  stageHint?: string;
}

/** 从仓内 prompts/game-gdd-clarify 组装系统提示词。 */
export function buildClarifySystemPrompt(opts: ClarifyPromptOpts): string {
  const { skillDir, mode, stage, stageHint } = opts;
  if (mode === "freeform") {
    return [FREEFORM_PROMPT, HOST_COMMON].join("\n\n");
  }

  const rawSkill = stripFrontmatter(readIfExists(skillDir, "SKILL.md"));
  if (!rawSkill.trim()) {
    throw new Error(`clarify skill missing SKILL.md in ${skillDir}`);
  }
  const skill = dropSkillConvergence(rawSkill, stage);

  const parts = [skill, HOST_COMMON, HOST_GUIDE];
  const asks = readIfExists(skillDir, "asks.md");
  const slice = asksSliceForStage(asks, stage);
  if (slice.trim()) parts.push(slice);
  if (stage >= 6) {
    const completeness = readIfExists(skillDir, "completeness.md");
    if (completeness.trim()) parts.push(completeness);
  }
  if (stage >= 8) {
    const template = readIfExists(skillDir, "gdd-template.md");
    if (template.trim()) parts.push(template);
  }
  if (stageHint?.trim()) parts.push(stageHint.trim());
  return parts.join("\n\n");
}
