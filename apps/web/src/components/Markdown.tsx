import MarkdownRender from "markstream-react";

interface Props {
  content: string;
  /** 流式是否结束；false 时 markstream 保留 mid-state 解析（半截语法不卡 loading）。 */
  final?: boolean;
}

/** 全站唯一 Markdown 入口。后续自定义视觉风格只改此处与 .cq-md 的 CSS。 */
export function Markdown({ content, final = true }: Props) {
  return (
    <div className="cq-md">
      <MarkdownRender content={content} final={final} renderCodeBlocksAsPre />
    </div>
  );
}
