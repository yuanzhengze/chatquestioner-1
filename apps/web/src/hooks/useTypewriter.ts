import { useEffect, useRef, useState } from "react";

/** 纯函数：给定已过去时间与每字毫秒数，算出应显示的字数（封顶 total）。speed<=0 即瞬时全显。 */
export function charsForElapsed(elapsedMs: number, msPerChar: number, total: number): number {
  if (msPerChar <= 0) return total;
  return Math.min(total, Math.max(0, Math.floor(elapsedMs / msPerChar)));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * 打字机：把 text 按 msPerChar 逐字显现。
 * 返回 { shown, done, skip }；skip() 立即显示全文。
 * prefers-reduced-motion 下直接全显。
 */
export function useTypewriter(text: string, msPerChar = 30): { shown: string; done: boolean; skip: () => void } {
  const [count, setCount] = useState(0);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const skippedRef = useRef(false);

  useEffect(() => {
    skippedRef.current = false;
    setCount(0);
    if (prefersReducedMotion() || msPerChar <= 0) {
      setCount(text.length);
      return;
    }
    startRef.current = performance.now();
    const tick = () => {
      if (skippedRef.current) return;
      const c = charsForElapsed(performance.now() - startRef.current, msPerChar, text.length);
      setCount(c);
      if (c < text.length) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, msPerChar]);

  const skip = () => { skippedRef.current = true; cancelAnimationFrame(rafRef.current); setCount(text.length); };
  return { shown: text.slice(0, count), done: count >= text.length, skip };
}
