# game-gdd-clarify

从 chatquestioner 蒸馏出的 Agent Skill：在游戏项目里首次对话时，若用户创意未达完整 GDD，先用宿主提问工具询问是否走大约 10 轮的创意引导；选「是」后再澄清需求，最终写出 `{游戏名}-gdd.md`。

**本目录是产物，尚未安装到任何本机 Agent。** 要生效，需要你之后把整个文件夹拷到对应 skill 目录。

## 包含什么

| 文件 | 作用 |
|---|---|
| `SKILL.md` | 主指令：触发、提问协议、推进节奏、宪法、写盘 |
| `completeness.md` | 完整 GDD 的必填门 + 创新性自检 |
| `gdd-template.md` | 落盘用的 Markdown 章节模板 |
| `asks.md` | 问法参考（对用户不可见） |
| `examples.md` | 首次对话的对错样例 |
| `agents/openai.yaml` | Codex 界面元数据（安装到 Codex 时才有用） |

## 蒸馏来源

- `chatquestioner-1/prompts/newbee.system.md`：身份、每轮三步、透镜、宪法、排版
- `chatquestioner-1/docs/00-NewBee提问策略参考集.md`：五份策略的共性（先体验后玩法、单问、动态投喂、规模克制、防漂移）
- `chatquestioner-1/docs/08-通信GDD规范.md` §2：必填章节 + 创新性自检
- `chatquestioner-1/docs/01-设计方案.md` §6.1–§6.2：对话状态里的创意字段、Game Brief 深挖项
- `chatquestioner-1/packages/gdd`：GDD 字段（在模板里扩展成完整章节，不停留在薄渲染版）
- v3 的「阶段确认门」、v4 的「从用户原话回指」有吸收；**默认气质是 v1 创意导演**，因为用户已经进了游戏项目、知道自己在做游戏（不用 v4 潜行闲聊）

宿主提问能力（Cursor `AskQuestion`、Claude `AskUserQuestion` 等）替换了 chatquestioner 前端的 A/B 气泡，这是本 skill 相对原应用的适配点。

## 以后如何安装（现在不要拷）

把本文件夹 **整目录**复制过去，目录名保持 `game-gdd-clarify`：

| 宿主 | 路径 |
|---|---|
| Cursor 个人 | `~/.cursor/skills/game-gdd-clarify/` |
| Cursor 某仓库 | `<repo>/.cursor/skills/game-gdd-clarify/` |
| Claude Code | `~/.claude/skills/game-gdd-clarify/` 或 `<repo>/.claude/skills/game-gdd-clarify/` |
| Codex | `~/.codex/skills/game-gdd-clarify/` |

不要拷到 `~/.cursor/skills-cursor/`（那是 Cursor 内置 skill 目录）。

## 期望行为（安装之后）

1. 用户打开一个游戏项目，第一次对 Agent 说话。
2. Agent 审计现有 `{游戏名}-gdd.md`（及旧名 `gdd.md`）+ 用户这条创意。
3. 未达完整标准 → 先用宿主提问工具问要不要走大约 10 轮的创意引导。
4. 选「是」→ 每轮只问 1 题；选「否」→ 不进入引导。
5. 完整度门和创新性自检通过 → 用户确认 → 写入 `{游戏名}-gdd.md`（如 `八爪鱼迪斯科-gdd.md`）。
6. 引导完成并落盘前不写游戏代码。
