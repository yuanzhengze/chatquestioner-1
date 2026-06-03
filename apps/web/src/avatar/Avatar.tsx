import { useEffect, useState } from "react";
import { type AvatarView, bindingFor, assetUrls } from "@cq/avatar";

interface Props {
  view: AvatarView;
  /** 当前 emote 片段播放结束时回调（派发 emote-end，出列/回落 baseline）。 */
  onEmoteEnded: () => void;
  size?: number;
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduce;
}

/** 居中大主形象：baseline 视频循环垫底，emote 视频 one-shot 叠加播完回落。 */
export function Avatar({ view, onEmoteEnded, size = 360 }: Props) {
  const reduced = usePrefersReducedMotion();
  const baseline = bindingFor(view.baseline);
  const emote = view.emote ? bindingFor(view.emote) : null;
  const box = { width: size, height: size };

  if (reduced) {
    // 降级：只显示当前状态首帧 poster，不播动画。
    const top = emote ?? baseline;
    return (
      <div className="avatar" style={box}>
        <img className="avatar-layer" src={assetUrls(top.primitive).poster} alt="NewBee" />
      </div>
    );
  }

  const baseUrls = assetUrls(baseline.primitive);
  return (
    <div className="avatar" style={box}>
      <video
        key={baseline.primitive}
        className="avatar-layer"
        autoPlay
        loop
        muted
        playsInline
        poster={baseUrls.poster}
      >
        <source src={baseUrls.webm} type="video/webm" />
        <source src={baseUrls.hevc} type="video/mp4; codecs=hvc1" />
      </video>
      {emote && <EmoteLayer key={view.emote!} primitive={emote.primitive} onEnded={onEmoteEnded} />}
    </div>
  );
}

function EmoteLayer({ primitive, onEnded }: { primitive: string; onEnded: () => void }) {
  const urls = assetUrls(primitive);
  return (
    <video
      className="avatar-layer avatar-emote"
      autoPlay
      muted
      playsInline
      poster={urls.poster}
      onEnded={onEnded}
      onError={onEnded}
    >
      <source src={urls.webm} type="video/webm" />
      <source src={urls.hevc} type="video/mp4; codecs=hvc1" />
    </video>
  );
}
