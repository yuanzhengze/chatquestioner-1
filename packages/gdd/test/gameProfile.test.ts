import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { emptyGddModel, gameProfileFromModel, toGddView, type GddModel } from "../src/index.js";

const { toGddView: toMiniView } = createRequire(import.meta.url)("../../../apps/miniprogram/utils/gddView.js") as {
  toGddView: (model: GddModel) => { profile: ReturnType<typeof gameProfileFromModel> };
};

function model(patch: Partial<GddModel> = {}): GddModel {
  return { ...emptyGddModel(), ...patch, presentation: { ...emptyGddModel().presentation, ...patch.presentation } };
}

describe("基本形态", () => {
  it("只映射已确认字段，类型留给模型缓存", () => {
    const profile = gameProfileFromModel(model({
      pitch: "一款恐怖游戏",
      mechanics: ["恐怖追逐"],
      presentation: { where: "电脑", dimension: "平面", orientation: "", players: "自己玩", assets: "" },
    }));
    expect(profile.formatLine).toBe("单人 · PC · 2D");
    expect(profile.genres).toEqual([]);
    expect(profile.tags).toEqual([]);
    expect(gameProfileFromModel(model({
      presentation: { where: "掌机", dimension: "能转视角的立体", orientation: "横屏", players: "可以自己玩也可以拜访", assets: "" },
    })).formatLine).toBe("3D · 横屏");
  });

  it("小程序和 GddView 的形态一致，不再本地贴标签", () => {
    const source = model({
      presentation: { where: "手机", dimension: "平面", orientation: "竖屏", players: "自己玩", assets: "" },
      mechanics: ["点选摆珠：把珠子放进格子"],
    });
    expect(toMiniView(source).profile).toEqual(toGddView(source).profile);
    expect(toGddView(source).profile.genres).toEqual([]);
  });
});
