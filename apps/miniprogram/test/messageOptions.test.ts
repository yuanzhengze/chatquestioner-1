import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";

type Msg = Record<string, unknown>;
type Opt = { id: string; label: string; detail: string };
type Rect = { left: number; top: number; width: number; height: number };

const {
  isDirectionAsk,
  liveOptions,
  optionsOf,
  attachLiveOptions,
  freezeLiveOptions,
  markPending,
  placeGhosts,
  revealGhosts,
  preserveAssistantMeta,
  morphDelta,
  frozenSpacer,
  settleDrift,
} = createRequire(import.meta.url)("../utils/messageOptions.js") as {
  isDirectionAsk: (options: unknown) => boolean;
  liveOptions: (messages: Msg[]) => Opt[];
  optionsOf: (messages: Msg[]) => { options: Opt[]; at: number; live: boolean; pendingId: string };
  attachLiveOptions: (messages: Msg[], options: unknown) => Msg[];
  freezeLiveOptions: (messages: Msg[]) => Msg[];
  markPending: (messages: Msg[], id: string) => Msg[];
  placeGhosts: (messages: Msg[], content: string, display: string) => Msg[];
  revealGhosts: (messages: Msg[], role?: string) => Msg[];
  preserveAssistantMeta: (prev: Msg, content: string) => Msg;
  morphDelta: (from: Rect | null, to: Rect | null) => { dx: number; dy: number; width: number; height: number } | null;
  frozenSpacer: (optsHeight: unknown, insertHeight: unknown) => number;
  settleDrift: (scrollTop: unknown, freeze: unknown) => { scrollTop: number; drift: number };
};

const DIRECTION: Opt[] = [
  { id: "A", label: "守摊", detail: "守住自家摊位，把回头客养熟。" },
  { id: "B", label: "赶集", detail: "推着车赶集，哪热闹去哪。" },
];

const CONVERGENCE: Opt[] = [
  { id: "A", label: "就按这个定稿，写成设计文档", detail: "写成设计文档。" },
  { id: "B", label: "核心对，但要改某一块", detail: "指出想改的那一块。" },
  { id: "C", label: "还想再挖挖感觉 / 玩法", detail: "再挖挖。" },
];

const PATCH: Opt[] = [
  { id: "A", label: "应用这些改动", detail: "写进文档。" },
  { id: "B", label: "再改改说法", detail: "换个说法。" },
  { id: "C", label: "取消", detail: "先不改。" },
];

describe("messageOptions", () => {
  it("只有问方向的三选才算方向问句", () => {
    expect(isDirectionAsk(DIRECTION)).toBe(true);
    expect(isDirectionAsk(CONVERGENCE)).toBe(false);
    expect(isDirectionAsk(PATCH)).toBe(false);
    expect(isDirectionAsk([])).toBe(false);
  });

  it("选项挂到最后一条助手消息，并记下这轮问过方向", () => {
    const next = attachLiveOptions(
      [
        { role: "assistant", content: "开场" },
        { role: "user", content: "我想做食堂" },
        { role: "assistant", content: "你更想守摊还是赶集？" },
      ],
      DIRECTION,
    );
    expect(next[0].options).toBeUndefined();
    expect(next[2].options).toEqual(DIRECTION);
    expect(next[2].optionsLive).toBe(true);
    expect(next[2].tintAsk).toBe(true);
    expect(liveOptions(next)).toEqual(DIRECTION);
  });

  it("定稿三选不记衬底；空选项把旧选项摘干净", () => {
    const conv = attachLiveOptions([{ role: "assistant", content: "要定稿吗？" }], CONVERGENCE);
    expect(conv[0].optionsLive).toBe(true);
    expect(conv[0].tintAsk).toBeUndefined();

    const cleared = attachLiveOptions(conv, []);
    expect(cleared[0].options).toBeUndefined();
    expect(cleared[0].optionsLive).toBeUndefined();
    expect(liveOptions(cleared)).toEqual([]);
  });

  it("点下去后不可再点，但节点还在，收尾动画有的画", () => {
    const live = attachLiveOptions([{ role: "assistant", content: "守摊还是赶集？" }], DIRECTION);
    const pending = markPending(live, "A");
    expect(liveOptions(pending)).toEqual([]);
    expect(optionsOf(pending)).toEqual({ options: DIRECTION, at: 0, live: false, pendingId: "A" });
  });

  it("这轮收尾时撤掉选项节点，只留问过方向这个事实", () => {
    const live = attachLiveOptions([{ role: "assistant", content: "守摊还是赶集？" }], DIRECTION);
    const frozen = freezeLiveOptions(markPending(live, "A"));
    expect(frozen[0].options).toBeUndefined();
    expect(frozen[0].pendingId).toBeUndefined();
    expect(frozen[0].tintAsk).toBe(true);
    expect(optionsOf(frozen)).toEqual({ options: [], at: -1, live: false, pendingId: "" });
  });

  it("ghost 先占位再显形，气泡显示 label 而发出去的是 detail", () => {
    const placed = placeGhosts([{ role: "assistant", content: "守摊还是赶集？" }], "守住自家摊位。", "守摊");
    expect(placed).toHaveLength(3);
    expect(placed[1]).toEqual({ role: "user", content: "守住自家摊位。", display: "守摊", ghost: true });
    /** 「…」一开始就带上，占的高度才和探针量的一致。 */
    expect(placed[2]).toEqual({ role: "assistant", content: "", appear: true, ghost: true });
  });

  it("落地先放用户气泡，「…」留到下一步", () => {
    const placed = placeGhosts([{ role: "assistant", content: "守摊还是赶集？" }], "守住自家摊位。", "守摊");
    const landed = revealGhosts(placed, "user");
    expect(landed[1].ghost).toBeUndefined();
    expect(landed[1].display).toBe("守摊");
    expect(landed[2].ghost).toBe(true);

    const sent = revealGhosts(landed);
    expect(sent[2].ghost).toBeUndefined();
    expect(sent[2].appear).toBe(true);
  });

  it("流式刷新保住选项、衬底，字出来后收掉 appear", () => {
    const prev = attachLiveOptions([{ role: "assistant", content: "", appear: true }], DIRECTION)[0];
    const empty = preserveAssistantMeta(prev, "");
    expect(empty.appear).toBe(true);

    const flushed = preserveAssistantMeta(prev, "你更想守摊还是赶集？");
    expect(flushed.content).toBe("你更想守摊还是赶集？");
    expect(flushed.options).toEqual(DIRECTION);
    expect(flushed.tintAsk).toBe(true);
    expect(flushed.appear).toBeUndefined();
  });

  it("落点按真实气泡算，量不到就不动画", () => {
    expect(morphDelta(null, { left: 10, top: 20, width: 80, height: 40 })).toBeNull();
    expect(morphDelta({ left: 10, top: 20, width: 0, height: 40 }, { left: 1, top: 2, width: 8, height: 4 })).toBeNull();
    expect(
      morphDelta({ left: 16, top: 120, width: 200, height: 80 }, { left: 180, top: 248, width: 88, height: 52 }),
    ).toEqual({ dx: 164, dy: 128, width: 88, height: 52 });
  });

  it("选项块就地压掉两条气泡的高度，内容总高不变", () => {
    expect(frozenSpacer(280, 96)).toBe(184);
    expect(frozenSpacer(60, 96)).toBe(0);
    expect(frozenSpacer(0, 96)).toBe(-1);
    expect(frozenSpacer(280, 0)).toBe(-1);
    expect(frozenSpacer(280, NaN)).toBe(-1);
  });

  it("收选项块靠自己往上滚；滚得动时气泡一动不动", () => {
    expect(settleDrift(500, 180)).toEqual({ scrollTop: 320, drift: 0 });
  });

  it("滚不动那么多时，差额由气泡自己往上走，芯片提前算进落点", () => {
    expect(settleDrift(50, 180)).toEqual({ scrollTop: 0, drift: -130 });
    expect(settleDrift(0, 180)).toEqual({ scrollTop: 0, drift: -180 });
  });

  it("没有选项块要收就什么都不动", () => {
    expect(settleDrift(500, 0)).toEqual({ scrollTop: 500, drift: 0 });
    expect(settleDrift(500, NaN)).toEqual({ scrollTop: 500, drift: 0 });
  });
});
