import { describe, expect, it } from "vitest";
import { ImageGenerationQueue } from "../src/imageQueue.js";

function deferred() {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

describe("image generation queue", () => {
  it("并发不超过配置，重复 id 不入队", async () => {
    const queue = new ImageGenerationQueue(2);
    const started: string[] = [];
    const hold = deferred();
    const run = (id: string) => async () => {
      started.push(id);
      await hold.gate;
    };
    expect(queue.enqueue({ id: "a", priority: 1, run: run("a") })).toBe(true);
    expect(queue.enqueue({ id: "a", priority: 1, run: run("a-again") })).toBe(false);
    expect(queue.enqueue({ id: "b", priority: 1, run: run("b") })).toBe(true);
    expect(queue.enqueue({ id: "c", priority: 1, run: run("c") })).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toEqual(["a", "b"]);
    expect(queue.activeCount).toBe(2);
    expect(queue.waitingIds).toEqual(["c"]);
    hold.release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toEqual(["a", "b", "c"]);
    expect(queue.activeCount).toBe(0);
  });

  it("新的封面插到还没开始的玩法图前面，正在跑的不打断", async () => {
    const queue = new ImageGenerationQueue(1);
    const started: string[] = [];
    const first = deferred();
    const rest = deferred();
    const run = (id: string, gate: Promise<void>) => async () => {
      started.push(id);
      await gate;
    };
    queue.enqueue({ id: "A-cover", priority: 0, run: run("A-cover", first.gate) });
    queue.enqueue({ id: "A-gp-1", priority: 1, run: run("A-gp-1", rest.gate) });
    queue.enqueue({ id: "A-gp-2", priority: 1, run: run("A-gp-2", rest.gate) });
    queue.enqueue({ id: "A-regen", priority: 2, run: run("A-regen", rest.gate) });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started).toEqual(["A-cover"]);
    queue.enqueue({ id: "B-cover", priority: 0, run: run("B-cover", rest.gate) });
    queue.enqueue({ id: "B-gp-1", priority: 1, run: run("B-gp-1", rest.gate) });
    expect(queue.waitingIds).toEqual(["B-cover", "A-gp-1", "A-gp-2", "B-gp-1", "A-regen"]);
    first.release();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started[1]).toBe("B-cover");
    rest.release();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(started).toEqual(["A-cover", "B-cover", "A-gp-1", "A-gp-2", "B-gp-1", "A-regen"]);
  });

  it("不同会话的同一机制 id 是两个任务", async () => {
    const queue = new ImageGenerationQueue(2);
    const started: string[] = [];
    const hold = deferred();
    const run = (id: string) => async () => {
      started.push(id);
      await hold.gate;
    };
    queue.enqueue({ id: "gameplay:A:mech:fp", priority: 1, run: run("A") });
    queue.enqueue({ id: "gameplay:B:mech:fp", priority: 1, run: run("B") });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(started.sort()).toEqual(["A", "B"]);
    hold.release();
  });
});
