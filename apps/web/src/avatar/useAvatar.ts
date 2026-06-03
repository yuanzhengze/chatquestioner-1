import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AvatarView, type AvatarSignal,
  initialView, reduce, lifecycle, emote, emoteEnd,
} from "@cq/avatar";
import type { UseSession } from "../hooks/useSession.js";
import { deriveBaseline, deriveStageEmotes, diffState, type StateSnapshot } from "./derive.js";

/**
 * 把 useSession 暴露的响应式输出（busy/messages/state/stage/synthesis/error/warnTick）
 * 派生成 AvatarSignal，驱动 @cq/avatar 的纯 FSM。不二次消费 SSE、不改 useSession 的网络层。
 */
export function useAvatar(session: UseSession, typing: boolean): {
  view: AvatarView;
  onEmoteEnded: () => void;
} {
  const [view, setView] = useState<AvatarView>(() => initialView("idle"));
  const dispatch = useCallback((sig: AvatarSignal) => setView((v) => reduce(v, sig)), []);

  // baseline：随生命周期切换
  const last = session.messages[session.messages.length - 1];
  useEffect(() => {
    dispatch(lifecycle(deriveBaseline({
      busy: session.busy,
      typing,
      lastRole: last?.role,
      lastContentLen: last?.content.length ?? 0,
    })));
  }, [session.busy, typing, last?.role, last?.content.length, dispatch]);

  // 语义 emote：state 快照 diff（首帧只存基线，不触发）
  const prevStateRef = useRef<StateSnapshot | null>(null);
  useEffect(() => {
    if (!session.state) return;
    const next = session.state as unknown as StateSnapshot;
    const prev = prevStateRef.current;
    prevStateRef.current = next;
    if (prev === null) return;
    for (const e of diffState(prev, next)) dispatch(emote(e));
  }, [session.state, dispatch]);

  // 阶段推进
  const prevStageRef = useRef<number | null>(null);
  useEffect(() => {
    if (!session.stage) return;
    for (const e of deriveStageEmotes(prevStageRef.current, session.stage.stage)) dispatch(emote(e));
    prevStageRef.current = session.stage.stage;
  }, [session.stage, dispatch]);

  // 收敛达成：预览随后每轮都会刷新（对象引用变化），仅在首次出现时庆祝一次。
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (session.synthesis && !celebratedRef.current) {
      celebratedRef.current = true;
      dispatch(emote("synthesis"));
    }
  }, [session.synthesis, dispatch]);

  // 出错
  useEffect(() => {
    if (session.error) dispatch(emote("error"));
  }, [session.error, dispatch]);

  // 解析告警
  useEffect(() => {
    if (session.warnTick > 0) dispatch(emote("parse-warning"));
  }, [session.warnTick, dispatch]);

  const onEmoteEnded = useCallback(() => dispatch(emoteEnd()), [dispatch]);
  return { view, onEmoteEnded };
}
