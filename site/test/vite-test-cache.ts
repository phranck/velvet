import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ViteTestCache {
  cleanup(): Promise<void>;
  path: string;
}

export async function createViteTestCache(label: string): Promise<ViteTestCache> {
  const path = await mkdtemp(join(tmpdir(), `velvet-${label}-`));

  return {
    path,
    cleanup: () => rm(path, { recursive: true, force: true }),
  };
}
