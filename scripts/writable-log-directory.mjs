import { appendFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

export const selectWritableLogDirectory = (candidates) => {
  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      mkdirSync(candidate, { recursive: true });
      const probe = join(candidate, `.pdv-write-test-${process.pid}`);
      appendFileSync(probe, "", "utf8");
      rmSync(probe, { force: true });
      return candidate;
    } catch {
      // Try the next directory; logging must never prevent startup or build.
    }
  }

  return "";
};
