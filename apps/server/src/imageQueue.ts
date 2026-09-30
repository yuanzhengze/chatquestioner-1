export interface ImageQueueJob {
  /** artifactType + sessionId + mechanicId + fingerprint。不同会话即使机制 id 相同也不是同一个任务。 */
  id: string;
  /** 0 封面，1 首次玩法图，2 用户重画。数字越小越先执行。 */
  priority: number;
  run: () => Promise<void>;
}

/**
 * 全局生图队列。正在跑的任务不中断。
 * 还没开始的任务按优先级插队，同一优先级保持先来后到。
 */
export class ImageGenerationQueue {
  private readonly waiting: ImageQueueJob[] = [];
  private readonly known = new Set<string>();
  private active = 0;

  constructor(readonly concurrency: number) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new Error(`invalid image concurrency: ${concurrency}`);
    }
  }

  get activeCount(): number {
    return this.active;
  }

  get waitingIds(): string[] {
    return this.waiting.map((job) => job.id);
  }

  has(id: string): boolean {
    return this.known.has(id);
  }

  enqueue(job: ImageQueueJob): boolean {
    if (this.known.has(job.id)) return false;
    this.known.add(job.id);
    let index = this.waiting.length;
    while (index > 0 && this.waiting[index - 1].priority > job.priority) index -= 1;
    this.waiting.splice(index, 0, job);
    this.pump();
    return true;
  }

  private pump(): void {
    while (this.active < this.concurrency && this.waiting.length > 0) {
      const job = this.waiting.shift();
      if (!job) return;
      this.active += 1;
      void job.run().finally(() => {
        this.known.delete(job.id);
        this.active -= 1;
        this.pump();
      });
    }
  }
}
