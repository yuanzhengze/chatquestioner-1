import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

export class CoverStore {
  constructor(private readonly dir: string) {
    mkdirSync(this.dir, { recursive: true });
  }

  pathFor(kind: "session" | "share", id: string): string {
    return join(this.dir, `${kind}-${id}.png`);
  }

  has(kind: "session" | "share", id: string): boolean {
    return SAFE_ID.test(id) && existsSync(this.pathFor(kind, id));
  }

  read(kind: "session" | "share", id: string): Buffer | null {
    if (!this.has(kind, id)) return null;
    return readFileSync(this.pathFor(kind, id));
  }

  mimeOf(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
    return "image/png";
  }

  writeSession(id: string, bytes: Buffer): void {
    if (!SAFE_ID.test(id)) throw new Error("invalid id");
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.pathFor("session", id), bytes);
  }

  copySessionToShare(sessionId: string, shareId: string): boolean {
    if (!this.has("session", sessionId) || !SAFE_ID.test(shareId)) return false;
    copyFileSync(this.pathFor("session", sessionId), this.pathFor("share", shareId));
    return true;
  }

  removeSession(id: string): void {
    const p = this.pathFor("session", id);
    if (existsSync(p)) unlinkSync(p);
  }
}

export function coverDirFromData(dataDir: string): string {
  return resolve(dataDir, "covers");
}
