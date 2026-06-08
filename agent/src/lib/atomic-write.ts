// Crash-safe persistence: write to a unique temp file in the SAME directory, then
// rename it over the target. rename(2) is atomic on POSIX (and replace-on-rename on
// Windows via libuv), so a reader never observes a half-written/truncated file and a
// crash mid-write leaves the previous good file intact.
//
// The accretive .rag stores (ledger / exemplars / error-fixes / index cache) keep the
// project's long-term learning; the plain writeFileSync they replaced could leave a
// corrupt JSON that loadX() silently reads as empty — wiping all accumulated data on a
// single ill-timed crash. This makes their durability consistent with the rest of the
// codebase, which already relies on atomic temp+rename semantics (file-manager.ts).
import fs from "fs";
import path from "path";
import crypto from "crypto";

/** Atomically write `content` to `filePath` (creates parent dirs). Throws on failure. */
export const atomicWriteFileSync = (filePath: string, content: string): void => {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(tmp, content, "utf-8");
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* temp cleanup is best-effort */
    }
    throw error;
  }
};
