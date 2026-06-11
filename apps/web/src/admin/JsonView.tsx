import { useState } from "react";

/** 折叠/复制的 JSON 查看器。data 为任意可序列化对象。 */
export function JsonView({ data, collapsed = false }: { data: unknown; collapsed?: boolean }) {
  const [open, setOpen] = useState(!collapsed);
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard 不可用时静默 */
    }
  };

  return (
    <div className="jsonview">
      <div className="jsonview-bar">
        <button className="btn-mini" onClick={() => setOpen((v) => !v)}>
          {open ? "折叠" : "展开"}
        </button>
        <button className="btn-mini" onClick={copy}>
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      {open && <pre className="jsonview-pre">{text}</pre>}
    </div>
  );
}
