/** 同一会话的读改写串起来。不同会话互不等待。 */
export class SessionMutex {
  private readonly chains = new Map<string, Promise<unknown>>();

  run<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.chains.get(sessionId) ?? Promise.resolve();
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = prev.then(() => gate, () => gate);
    this.chains.set(sessionId, tail);
    return prev.catch(() => undefined).then(async () => {
      try {
        return await fn();
      } finally {
        release();
        if (this.chains.get(sessionId) === tail) this.chains.delete(sessionId);
      }
    });
  }
}
