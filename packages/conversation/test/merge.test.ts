import { describe, it, expect } from "vitest";
import { createInitialState } from "../src/state.js";
import { mergeStateDelta } from "../src/merge.js";

describe("mergeStateDelta", () => {
  it("标量有值即覆盖，未提供则保留", () => {
    const s = createInitialState();
    s.coreEmotion = "孤独";
    mergeStateDelta(s, { coreFantasy: "成为深海灯塔" });
    expect(s.coreEmotion).toBe("孤独");
    expect(s.coreFantasy).toBe("成为深海灯塔");
  });

  it("数组并集去重保序", () => {
    const s = createInitialState();
    s.references = ["纪念碑谷"];
    mergeStateDelta(s, { references: ["纪念碑谷", "Gris"] });
    expect(s.references).toEqual(["纪念碑谷", "Gris"]);
  });

  it("keywordPools 逐池并集", () => {
    const s = createInitialState();
    s.keywordPools.emotion = ["治愈"];
    mergeStateDelta(s, { keywordPools: { emotion: ["治愈", "解压"], visual: ["水彩"] } });
    expect(s.keywordPools.emotion).toEqual(["治愈", "解压"]);
    expect(s.keywordPools.visual).toEqual(["水彩"]);
  });

  it("loop 逐键覆盖、mvpScope 并集", () => {
    const s = createInitialState();
    s.loop.thirtySec = "划线消除";
    mergeStateDelta(s, { loop: { fiveMin: "凑齐连击" }, mvpScope: { must: ["核心循环"] } });
    expect(s.loop).toEqual({ thirtySec: "划线消除", fiveMin: "凑齐连击" });
    expect(s.mvpScope.must).toEqual(["核心循环"]);
  });

  it("engineering 标量覆盖 + 数组并集", () => {
    const s = createInitialState();
    s.engineering.platform = ["PC"];
    mergeStateDelta(s, {
      engineering: { dimension: "2D", platform: ["PC", "mobile"], modalities: ["image", "audio"] },
    });
    expect(s.engineering.dimension).toBe("2D");
    expect(s.engineering.platform).toEqual(["PC", "mobile"]);
    expect(s.engineering.modalities).toEqual(["image", "audio"]);
  });

  it("返回的就是传入对象（原地修改）", () => {
    const s = createInitialState();
    expect(mergeStateDelta(s, { pitch: "x" })).toBe(s);
  });
});
