import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/**
 * File-backed "My Library" storage.
 *
 * Keeps saved papers in `data/library.json` on the server, keyed by the
 * stable per-account identity (`google:<providerAccountId>` or
 * `email:<address>`, resolved in `library/session.ts`). The key never changes
 * between sign-ins for the same account, so entries survive sign-out/sign-in.
 * No database or cloud account needed; entries survive dev-server restarts. Writes are serialized through an
 * in-process lock and applied atomically (write temp file + rename) so
 * concurrent save/unsave requests can't corrupt or lose entries.
 */

export interface SavedPaperEntry {
  id: string;
  paper_id: string;
  paper_data: unknown;
  created_at: string;
}

type LibraryFile = Record<string, SavedPaperEntry[]>;

const FILE_PATH = path.join(process.cwd(), "data", "library.json");

// Serializes read-modify-write cycles within this server process.
let writeLock: Promise<void> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLock.then(fn);
  writeLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function readLibrary(): Promise<LibraryFile> {
  try {
    const raw = await fs.readFile(FILE_PATH, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as LibraryFile;
    }
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") return {};
    throw e;
  }
}

async function writeLibrary(data: LibraryFile): Promise<void> {
  await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
  const payload = JSON.stringify(data, null, 2);
  // Prefer an atomic write (temp file + rename). On Windows, freshly written
  // files can be transiently locked by AV scanners, sync clients, or the dev
  // server's file watcher, so retry the rename and fall back to a direct
  // write rather than failing the save.
  const tmpPath = `${FILE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, payload, "utf8");
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmpPath, FILE_PATH);
        return;
      } catch (e) {
        const code = (e as NodeJS.ErrnoException)?.code;
        if ((code === "EPERM" || code === "EBUSY") && attempt < 5) {
          await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
  } catch {
    await fs.writeFile(FILE_PATH, payload, "utf8");
  } finally {
    await fs.rm(tmpPath, { force: true });
  }
}

const STABLE_KEY_RE = /^[^:]+:.+$/;
const LEGACY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isLegacyKey(key: string): boolean {
  // Pre-fix buckets were keyed by `token.sub`, which was a fresh random UUID
  // on every sign-in. Stable keys are always namespaced (`google:<sub>` /
  // `email:<address>`), so any bare UUID bucket is an orphan of a previous
  // login that its owner can no longer address.
  return LEGACY_UUID_RE.test(key);
}

/**
 * One-time adoption of orphaned pre-fix buckets into the caller's stable
 * bucket. Runs whenever a stable (namespaced) identity reads or writes, and
 * only while that bucket does not exist yet. Entries are deduplicated by
 * `paper_id`, keeping the newest copy, then the orphan buckets are removed.
 */
function adoptLegacyBuckets(data: LibraryFile, userId: string): boolean {
  if (!STABLE_KEY_RE.test(userId)) return false;
  if ((data[userId]?.length ?? 0) > 0) return false;
  const orphanKeys = Object.keys(data).filter(isLegacyKey);
  if (orphanKeys.length === 0) return false;

  const merged = new Map<string, SavedPaperEntry>();
  for (const key of orphanKeys) {
    for (const entry of data[key] ?? []) {
      const prev = merged.get(entry.paper_id);
      if (!prev || prev.created_at < entry.created_at) merged.set(entry.paper_id, entry);
    }
    delete data[key];
  }
  // Preserve entries already staged under the stable key (normally none).
  for (const entry of data[userId] ?? []) {
    const prev = merged.get(entry.paper_id);
    if (!prev || prev.created_at < entry.created_at) merged.set(entry.paper_id, entry);
  }
  data[userId] = [...merged.values()].sort((a, b) =>
    a.created_at < b.created_at ? 1 : -1
  );
  console.log(
    `Library migration: adopted ${merged.size} entr(ies) from ${orphanKeys.length} legacy bucket(s) into ${userId}`
  );
  return true;
}

export async function listSaved(userId: string): Promise<SavedPaperEntry[]> {
  return withLock(async () => {
    const data = await readLibrary();
    if (adoptLegacyBuckets(data, userId)) {
      await writeLibrary(data);
    }
    const entries = data[userId] ?? [];
    return [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  });
}

export async function getSavedIds(userId: string, paperIds: string[]): Promise<string[]> {
  if (paperIds.length === 0) return [];
  const wanted = new Set(paperIds);
  const entries = await listSaved(userId);
  return entries.filter((e) => wanted.has(e.paper_id)).map((e) => e.paper_id);
}

export async function savePaper(
  userId: string,
  paperId: string,
  paperData: unknown
): Promise<SavedPaperEntry> {
  return withLock(async () => {
    const data = await readLibrary();
    adoptLegacyBuckets(data, userId);
    const entries = data[userId] ?? [];
    const existing = entries.find((e) => e.paper_id === paperId);
    if (existing) {
      existing.paper_data = paperData;
      await writeLibrary(data);
      return existing;
    }
    const entry: SavedPaperEntry = {
      id: randomUUID(),
      paper_id: paperId,
      paper_data: paperData,
      created_at: new Date().toISOString(),
    };
    entries.unshift(entry);
    data[userId] = entries;
    await writeLibrary(data);
    return entry;
  });
}

export async function unsavePaper(userId: string, paperId: string): Promise<void> {
  await withLock(async () => {
    const data = await readLibrary();
    const migrated = adoptLegacyBuckets(data, userId);
    const entries = data[userId] ?? [];
    const next = entries.filter((e) => e.paper_id !== paperId);
    if (next.length !== entries.length || migrated) {
      data[userId] = next;
      await writeLibrary(data);
    }
  });
}
