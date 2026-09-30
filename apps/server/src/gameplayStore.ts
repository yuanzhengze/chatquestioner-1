import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class GameplayStore {
  constructor(private readonly dir: string) {
    mkdirSync(this.dir, { recursive: true });
  }

  pathFor(sessionId: string, mechanicId: string): string {
    return join(this.dir, `${sessionId}--${mechanicId}.png`);
  }

  has(sessionId: string, mechanicId: string): boolean {
    return SAFE_ID.test(sessionId) && SAFE_ID.test(mechanicId) && existsSync(this.pathFor(sessionId, mechanicId));
  }

  read(sessionId: string, mechanicId: string): Buffer | null {
    if (!this.has(sessionId, mechanicId)) return null;
    return readFileSync(this.pathFor(sessionId, mechanicId));
  }

  write(sessionId: string, mechanicId: string, bytes: Buffer): void {
    if (!SAFE_ID.test(sessionId) || !SAFE_ID.test(mechanicId)) throw new Error("invalid gameplay id");
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.pathFor(sessionId, mechanicId), bytes);
  }

  copy(sessionId: string, fromMechanicId: string, toMechanicId: string): boolean {
    if (!this.has(sessionId, fromMechanicId) || !SAFE_ID.test(toMechanicId) || fromMechanicId === toMechanicId) return false;
    copyFileSync(this.pathFor(sessionId, fromMechanicId), this.pathFor(sessionId, toMechanicId));
    return true;
  }

  remove(sessionId: string, mechanicId: string): void {
    const p = this.pathFor(sessionId, mechanicId);
    if (SAFE_ID.test(sessionId) && SAFE_ID.test(mechanicId) && existsSync(p)) unlinkSync(p);
  }
}

export function gameplayDirFromData(dataDir: string): string {
  return resolve(dataDir, "gameplay");
}
