import { describe, expect, it } from "vitest";
import {
  emptyGddModel,
  gameplayImageFingerprint,
  gameplayImagePrompt,
  gameplayMomentsFromModel,
  presentGameplayStatus,
  rebindGameplayLineup,
  visualBibleFingerprint,
  visualBibleFromModel,
} from "../src/index.js";

function puzzle() {
  const m = emptyGddModel();
  m.title = "机关谜盒";
  m.world = "发条匣中的棋盘";
  m.playerIdentity = "解谜的学徒";
  m.coreFantasy = "把散落的零件拼回机关";
  m.aesthetic = "黄铜与冷蓝玻璃，精密机械";
  m.keywordPools.visual = ["黄铜", "冷蓝", "齿轮"];
  m.presentation = { where: "手机", dimension: "平面", orientation: "竖屏", players: "自己玩", assets: "零件" };
  m.mechanics = [
    "相邻交换与基础匹配消除：拖动一个零件与旁边零件交换，形成一组后消除并更新棋盘。",
    "特殊消除制造：通过特定排列生成特殊效果，棋盘因此改写。",
    "连锁结算：一次消除引发下一组自动消除。",
  ];
  return m;
}

describe("玩法图视觉设定与提示词", () => {
  it("视觉设定只收已有字段，封面和玩法图读到同一份", () => {
    const bible = visualBibleFromModel(puzzle());
    expect(bible).toContain("世界：发条匣中的棋盘");
    expect(bible).toContain("主角：解谜的学徒");
    expect(bible).toContain("美术：黄铜与冷蓝玻璃，精密机械");
    expect(bible).toContain("色彩与材质：黄铜、冷蓝、齿轮");
    expect(bible).not.toContain("机关谜盒");
    expect(visualBibleFingerprint(puzzle())).toBe(visualBibleFingerprint(puzzle()));
  });

  it("改美术则视觉指纹变，机制原文不变", () => {
    const a = puzzle();
    const b = puzzle();
    b.aesthetic = "水彩纸感";
    expect(visualBibleFingerprint(a)).not.toBe(visualBibleFingerprint(b));
    expect(gameplayMomentsFromModel(a).map((item) => item.id)).toEqual(gameplayMomentsFromModel(b).map((item) => item.id));
  });

  it("玩法图提示词写清这一下在做什么，并排除海报和文字", () => {
    const m = puzzle();
    const moments = gameplayMomentsFromModel(m);
    const prompt = gameplayImagePrompt(m, moments[0]);
    expect(prompt).toContain("16:9 horizontal gameplay screenshot composition");
    expect(prompt).toContain("center-cropped to 16:9");
    expect(prompt).toContain("central 16:9 safe area");
    expect(prompt).toContain("No square composition");
    expect(prompt).toContain("no tutorial arrows");
    expect(prompt).toContain("相邻交换与基础匹配消除");
    expect(prompt).toContain("拖动一个零件与旁边零件交换");
    expect(prompt).toContain("黄铜与冷蓝玻璃");
    expect(prompt).not.toContain("特殊消除制造");
    const other = gameplayImagePrompt(m, moments[1]);
    expect(other).toContain("特殊消除制造");
    expect(other).not.toContain("拖动一个零件与旁边零件交换");
  });

  it("指纹跟机制和视觉设定走，不跟数组位置", () => {
    const m = puzzle();
    const moments = gameplayMomentsFromModel(m);
    const bible = visualBibleFingerprint(m);
    const first = gameplayImageFingerprint(moments[0], bible);
    const swapped = [moments[2], moments[0], moments[1]];
    expect(gameplayImageFingerprint(swapped[1], bible)).toBe(first);
    expect(gameplayImageFingerprint(moments[0], bible)).not.toBe(gameplayImageFingerprint(moments[1], bible));
    const changed = puzzle();
    changed.aesthetic = "像素";
    expect(gameplayImageFingerprint(moments[0], visualBibleFingerprint(changed))).not.toBe(first);
  });

  it("改一条机制只让旧图对上新空位；换序不搬家", () => {
    const ids = ["a", "b", "c"];
    expect(rebindGameplayLineup(ids, ["c", "a", "b"], ids)).toEqual([]);
    expect(rebindGameplayLineup(ids, ["a", "b2", "c"], ["a", "b", "c"])).toEqual([{ from: "b", to: "b2" }]);
    expect(rebindGameplayLineup(["a", "b"], ["a"], ["a", "b"])).toEqual([]);
  });

  it("同一指纹是 ready，视觉设定变了但文件还在则是 stale", () => {
    expect(presentGameplayStatus({ status: "ready", fingerprint: "aa" }, true, "aa")).toBe("ready");
    expect(presentGameplayStatus({ status: "ready", fingerprint: "aa" }, true, "bb")).toBe("stale");
    expect(presentGameplayStatus({ status: "pending", fingerprint: "aa" }, false, "aa")).toBe("pending");
    expect(presentGameplayStatus({ status: "failed", fingerprint: "aa" }, false, "aa")).toBe("failed");
    expect(presentGameplayStatus(null, false, "aa")).toBe("idle");
    expect(presentGameplayStatus({ status: "pending", fingerprint: "aa" }, false, "bb")).toBe("idle");
  });
});
