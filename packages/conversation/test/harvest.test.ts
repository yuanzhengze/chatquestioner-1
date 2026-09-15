import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { harvestIntoState, hasConceptSummary, questionSentences } from "../src/harvest.js";
import { toGddModel } from "../src/compile.js";
import { renderGdd, isComplete, isSubstantive } from "@cq/gdd";

const CAT_SUMMARY = `我把咱们聊出来的核心概念做了一个**概念总结**：

> 📌 **暂定游戏名**：《深夜猫咖》
> 📌 **一句话亮点**：你将扮演夜班店长，划线连同色猫，呼噜越响越解压。
> 📌 **核心体验**：治愈解压，连击时满屏猫爪。
> 📌 **核心循环**：划线连猫 ➔ 连击呼噜 ➔ 解锁新猫
> 📌 **差异化与防坑**：踩奶节奏，不是肝氪卡牌。`;

const HORROR_SUMMARY = `到这里，咱们这个游戏的骨架和灵魂都已经非常完整了。我把咱们聊出来的核心概念做了一个**概念总结**：

> 📌 **暂定游戏名**：《城寨幽鸣》（Echoes of Kowloon）
> 📌 **一句话亮点**：一款第一人称生存恐怖游戏。在暗无天日的九龙城寨中，每一次解谜通电都会招来致命怪物；你手中的枪开火之日，就是绝命逃亡之时。
> 📌 **核心体验**：极度压抑的资源焦虑与幽闭恐惧。用扎实沉重的步伐，在“致命深渊”与“绝对安全（废弃冰室）”间反复横跳。
> 📌 **核心循环**：摸黑搜刮与潜行 ➔ 制造高风险噪音解开机关 ➔ 怪物暴动，被迫开枪或夺路而逃 ➔ 惊险逃入暖黄灯光的冰室，获得喘息与补给。
> 📌 **差异化与防坑**：比起突突突的割草游戏，我们强调“有武器但不敢用”的心理博弈；比起纯躲猫猫游戏，我们将“解谜推进”与“致命噪音”强绑定。`;

describe("questionSentences", () => {
  it("只收问号句，不把共情段里的「通关」当成问题", () => {
    const qs = questionSentences("解开谜题不仅是通关。你希望玩家以什么视角来进入这座城寨？");
    expect(qs).toHaveLength(1);
    expect(qs[0]).toContain("视角");
    expect(qs[0]).not.toContain("不仅是通关");
  });
});

describe("harvestIntoState", () => {
  it("猫咪连连看：标签总结 + 问法意图，跟题材无关", () => {
    const s = createInitialState();
    s.history = [
      { role: "assistant", content: "朋友刚玩完，你希望他用哪三个词形容刚才的感受？" },
      { role: "user", content: "解压、治愈、想再来一局。" },
      { role: "assistant", content: "这游戏里最重要、最频繁要做的一件事是什么？" },
      { role: "user", content: "划线把同色的猫连起来。" },
      { role: "assistant", content: "发生在什么地方？玩家扮演谁？" },
      { role: "user", content: "深夜猫咖里的夜班店长。" },
      { role: "assistant", content: CAT_SUMMARY },
    ];
    harvestIntoState(s);
    expect(hasConceptSummary(s.history)).toBe(true);
    expect(s.workingTitle).toBe("深夜猫咖");
    expect(s.pitch).toContain("夜班店长");
    expect(s.playerIdentity).toContain("夜班店长");
    expect(s.coreEmotion).toContain("解压");
    expect(s.coreAction).toContain("同色");
    expect(s.world).toContain("猫咖");
    expect(s.loop.fiveMin).toContain("划线连猫");
    expect(s.mechanics.length).toBeGreaterThanOrEqual(2);
    expect(s.forbiddenEmotion).toBeFalsy();
    expect(s.presentation.orientation).toBeFalsy();
    expect(s.presentation.players).toBeFalsy();
    const m = toGddModel(s);
    expect(isSubstantive(m)).toBe(true);
    expect(isComplete(m)).toBe(false);
    expect(renderGdd(m)).toContain("深夜猫咖");
    expect(renderGdd(m)).not.toMatch(/### 核心动作\n（未写）/);
  });

  it("城寨问答回归：共情里的通关不抢走视角回答；标签和问法仍能进文档", () => {
    const s = createInitialState();
    s.spark = "在九龙城寨中手持武器探索";
    s.theme = "九龙城寨生存逃生";
    s.world = "逼仄、错综复杂、常年不见天日且危机四伏的九龙城寨";
    s.coreEmotion = "有反抗能力但不敢用的焦虑";
    s.coreAction = "摆弄城寨里错乱的电箱、水管或违建机关来推进探索";
    s.aesthetic = "铁锈、死水、冷光灯、第一人称受限手电筒视角、滴水回音";
    s.reward = "找到亮着暖黄色老台灯的废弃冰室";
    s.failRule = "一旦被抓到直接惨死，回到上一个安全屋(冰室)重新来过";
    s.gameFeel = "动作不快但指令反馈精准，沉重且扎实";
    s.coreExperience = "第一人称下充满火力权衡与噪音焦虑的幽闭城寨生存求生";
    s.loop.thirtySec = "目睹惊慌失措的NPC盲目开枪被怪物吞噬";
    s.presentation.where = "第一人称受限视角";
    s.presentation.dimension = "3D";
    s.history = [
      { role: "assistant", content: "当玩家越来越深入城寨腹地时，你希望游戏主要是通过**什么方式给玩家增加难度**？" },
      { role: "user", content: "给我几个选项呢" },
      { role: "assistant", content: "你希望游戏主要是通过**什么方式给玩家增加难度**？" },
      { role: "user", content: "怪物不再只是游荡，而是学会了设伏，或者对解谜发出的噪音反应更快。" },
      { role: "assistant", content: "主角冒着这么大风险不断向内部深入，他的**最终目的（也就是游戏的最终通关目标）**是什么？" },
      { role: "user", content: "寻找迷失在城寨深处的亲人或同伴，最终带着他活着逃到外面的世界。" },
      { role: "assistant", content: HORROR_SUMMARY },
      { role: "user", content: "确认当前的总结完美契合心中构想，直接生成最终的设计文档。" },
    ];
    harvestIntoState(s);
    expect(s.workingTitle).toBe("城寨幽鸣");
    expect(s.winRule).toContain("亲人");
    expect(s.difficulty.ramp).toContain("设伏");
    expect(s.difficulty.ramp).not.toContain("给我几个选项");
    const m = toGddModel(s);
    expect(m.presentation.where).not.toContain("第一人称");
    expect(renderGdd(m)).not.toMatch(/### 奖励节奏\n（未写）/);
  });

  it("已有 workingTitle 不被总结覆盖", () => {
    const s = createInitialState();
    s.workingTitle = "用户自己起的名";
    s.history = [{ role: "assistant", content: CAT_SUMMARY }];
    harvestIntoState(s);
    expect(s.workingTitle).toBe("用户自己起的名");
  });

  it("认任意题材的暂定名、通关/平台/避开问法；没问过的人数和横竖屏保持空", () => {
    const s = createInitialState();
    s.history = [
      { role: "assistant", content: "解开谜题不仅是通关。你希望玩家以什么视角来进入这座城寨？" },
      { role: "user", content: "第一人称视角" },
      { role: "assistant", content: "怎样才算这趟噩梦之旅的「通关」？" },
      { role: "user", content: "拼凑出当年城寨惨案的真相，并带着线索死里逃生。" },
      { role: "assistant", content: "你最希望这款游戏主要在哪个平台上让玩家体验？" },
      { role: "user", content: "键鼠操作，方便在危急时刻精准点击神龛解密。" },
      { role: "assistant", content: "有没有哪款特别想借鉴或者坚决避开的对标作品？" },
      { role: "user", content: "重中式民俗氛围和心理惊吓，避开过于复杂的背包管理。" },
      {
        role: "assistant",
        content: "> 📌 **暂定名**：《城寨：风水魇》\n> **一句话亮点**：你将扮演寻亲的调查员，用生锈铁管死磕出几秒喘息。",
      },
    ];
    harvestIntoState(s);
    expect(s.workingTitle).toBe("城寨：风水魇");
    expect(s.pitch).toContain("寻亲的调查员");
    expect(s.playerIdentity).toContain("寻亲的调查员");
    expect(s.winRule).toContain("真相");
    expect(s.winRule).not.toContain("第一人称");
    expect(s.presentation.where).toBe("电脑");
    expect(s.presentation.dimension).toBe("能转视角的立体");
    expect(s.avoidReferences.some((x) => x.includes("背包"))).toBe(true);
    expect(s.references.some((x) => /民俗|惊吓/.test(x))).toBe(true);
    expect(toGddModel(s).constitution.contentBoundary).toContain("背包");
    expect(s.presentation.orientation).toBeFalsy();
    expect(s.presentation.players).toBeFalsy();
    expect(s.forbiddenEmotion).toBeFalsy();
    expect(s.difficulty.fatigue).toBeFalsy();
  });

  it("问什么设备时，键鼠或手柄记成电脑", () => {
    const s = createInitialState();
    s.history = [
      { role: "assistant", content: "你更想在什么设备上玩？" },
      { role: "user", content: "键鼠或手柄都可以。" },
    ];
    harvestIntoState(s);
    expect(s.presentation.where).toBe("电脑");
  });
});
