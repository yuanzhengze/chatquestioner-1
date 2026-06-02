import { describe, it, expect } from "vitest";
import { parseSseEvents } from "../src/sse.js";

describe("parseSseEvents", () => {
  it("解析完整帧，残片留在 rest", () => {
    const buf =
      `event: token\ndata: {"text":"你好"}\n\n` +
      `event: stage\ndata: {"stage":2,"label":"核心体验+四元素","readyForSynthesis":false}\n\n` +
      `event: token\ndata: {"text":"未完`;
    const { events, rest } = parseSseEvents(buf);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "token", data: { text: "你好" } });
    expect(events[1].data).toMatchObject({ stage: 2 });
    expect(rest.startsWith("event: token")).toBe(true);
  });

  it("无完整帧时 events 空、rest 原样", () => {
    const { events, rest } = parseSseEvents("event: token\ndata: {");
    expect(events).toEqual([]);
    expect(rest).toBe("event: token\ndata: {");
  });
});
