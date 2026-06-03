import { describe, expect, it } from "vitest";
import {
  STATE_PRIMITIVE, bindingFor, assetUrls, EMOTE_PRIORITY,
  type AvatarState,
} from "../src/index.js";

const BASELINES: AvatarState[] = ["idle", "listening", "thinking", "speaking", "building"];
const EMOTES = Object.keys(EMOTE_PRIORITY) as AvatarState[];

describe("manifest · 完备性与解耦", () => {
  it("每个状态都绑定到一个原语", () => {
    for (const s of [...BASELINES, ...EMOTES]) {
      expect(bindingFor(s).primitive).toBeTruthy();
    }
  });

  it("baseline 都 loop，emote 都不 loop", () => {
    for (const s of BASELINES) expect(STATE_PRIMITIVE[s].loop).toBe(true);
    for (const s of EMOTES) expect(STATE_PRIMITIVE[s].loop).toBe(false);
  });

  it("原语集恰为 23 个、无重复", () => {
    const prims = new Set(Object.values(STATE_PRIMITIVE).map((b) => b.primitive));
    expect(prims.size).toBe(23);
  });

  it("assetUrls 按约定推导三件套", () => {
    expect(assetUrls("party")).toEqual({
      webm: "/avatar/party.webm",
      hevc: "/avatar/party.mov",
      poster: "/avatar/party.png",
    });
    expect(assetUrls("calm", "/cdn/ip/").webm).toBe("/cdn/ip/calm.webm");
  });
});
