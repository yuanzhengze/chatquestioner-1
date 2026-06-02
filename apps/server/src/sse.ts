import type { FastifyReply } from "fastify";

export function initSse(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
}

export function sendEvent(reply: FastifyReply, event: string, data: unknown): void {
  // 客户端断开后 socket 已关：写入会抛 EPIPE / write-after-end，静默放弃即可。
  if (reply.raw.writableEnded || reply.raw.destroyed) return;
  try {
    reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    // 写失败说明对端已消失，本帧无处可送，丢弃不影响其余逻辑。
  }
}

export function endSse(reply: FastifyReply): void {
  if (!reply.raw.writableEnded) reply.raw.end();
}
