import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emptyGddModel, toGddView } from "@cq/gdd";

const { toGddView: toMiniView } = createRequire(import.meta.url)("../utils/gddView.js") as {
  toGddView: (model: unknown) => { gameplayMoments: Array<{ id: string; title: string; description: string }> };
};

describe("小程序预览直接用派生的关键瞬间", () => {
  it("和 GddView 同一份结果，页面不再拆机制字符串", () => {
    const m = emptyGddModel();
    m.mechanics = [
      "点选摆珠：玩家先选择颜色或珠子类型，再点击图案空位，珠子滑入格子完成填充。",
      "整理桌面：先把材料摆齐",
    ];
    expect(toMiniView(m).gameplayMoments).toEqual(toGddView(m).gameplayMoments);
  });

  it("没有机制时两边都是空", () => {
    expect(toMiniView(emptyGddModel()).gameplayMoments).toEqual([]);
  });
});
