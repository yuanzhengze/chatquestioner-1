import { describe, expect, it } from "vitest";
import {
  initialView, reduce, reduceAll,
  lifecycle, emote, emoteEnd,
} from "../src/index.js";

describe("avatar FSM · baseline", () => {
  it("lifecycle 切换 baseline，不打断在播 emote", () => {
    let v = initialView();
    expect(v.baseline).toBe("idle");
    v = reduce(v, emote("spark-caught"));
    v = reduce(v, lifecycle("speaking"));
    expect(v.baseline).toBe("speaking");
    expect(v.emote).toBe("spark-caught"); // emote 未被打断
  });

  it("典型生命周期 idle→thinking→speaking→idle", () => {
    let v = initialView();
    v = reduceAll(v, [lifecycle("thinking"), lifecycle("speaking"), lifecycle("idle")]);
    expect(v.baseline).toBe("idle");
    expect(v.emote).toBeNull();
  });
});

describe("avatar FSM · emote 入队与回落", () => {
  it("空闲时 emote 直接上，emote-end 后回落 null", () => {
    let v = initialView();
    v = reduce(v, emote("confirm"));
    expect(v.emote).toBe("confirm");
    v = reduce(v, emoteEnd());
    expect(v.emote).toBeNull();
  });

  it("两个非终结 emote：先到的播，次高优先级进候补，end 后续播", () => {
    let v = initialView();
    v = reduce(v, emote("idea-feed"));      // 低优先级先到
    v = reduce(v, emote("spark-caught"));   // 高优先级后到 → 候补
    expect(v.emote).toBe("idea-feed");
    expect(v.queue).toEqual(["spark-caught"]);
    v = reduce(v, emoteEnd());
    expect(v.emote).toBe("spark-caught");
    expect(v.queue).toEqual([]);
  });

  it("候补容量为 1：第三个低优先级被丢弃", () => {
    let v = initialView();
    v = reduceAll(v, [emote("idea-feed"), emote("confirm"), emote("curious-probe")]);
    expect(v.emote).toBe("idea-feed");
    expect(v.queue).toEqual(["confirm"]); // curious-probe(15) < confirm(25) 被挤掉
  });

  it("候补去重 + 不与当前重复", () => {
    let v = initialView();
    v = reduceAll(v, [emote("confirm"), emote("confirm"), emote("spark-caught"), emote("spark-caught")]);
    expect(v.emote).toBe("confirm");
    expect(v.queue).toEqual(["spark-caught"]);
  });
});

describe("avatar FSM · 终结性 emote 独占", () => {
  it("synthesis 抢占当前并清空候补队列", () => {
    let v = initialView();
    v = reduceAll(v, [emote("spark-caught"), emote("confirm")]);
    expect(v.emote).toBe("spark-caught");
    expect(v.queue).toEqual(["confirm"]);
    v = reduce(v, emote("synthesis"));
    expect(v.emote).toBe("synthesis");
    expect(v.queue).toEqual([]);
  });

  it("error 同样抢占独占", () => {
    let v = initialView();
    v = reduce(v, emote("stage-up"));
    v = reduce(v, emote("error"));
    expect(v.emote).toBe("error");
    expect(v.queue).toEqual([]);
  });

  it("synthesis 播完回落到当前 baseline（idle）", () => {
    let v = initialView();
    v = reduce(v, lifecycle("idle"));
    v = reduce(v, emote("synthesis"));
    v = reduce(v, emoteEnd());
    expect(v.emote).toBeNull();
    expect(v.baseline).toBe("idle");
  });
});
