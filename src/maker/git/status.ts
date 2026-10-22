/**
 * Parser for `git status --porcelain=v1 -z` output.
 */

export interface GitStatusEntry {
  /** Two-column status, e.g. " M", "??", "R ". Never trimmed. */
  status: string;
  path: string;
  /** Source path of a rename or copy. */
  originalPath?: string;
}

export function parseStatusZ(raw: string): GitStatusEntry[] {
  const records = raw.split('\0');
  const entries: GitStatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    const status = record.slice(0, 2);
    const entry: GitStatusEntry = { status, path: record.slice(3) };
    if (/[RC]/.test(status)) {
      const originalPath = records[index + 1];
      index += 1;
      if (originalPath) entry.originalPath = originalPath;
    }
    entries.push(entry);
  }
  return entries;
}

/** Paths reported by status; rename/copy sources are included only when requested. */
export function statusPaths(entries: GitStatusEntry[], includeOriginal = false): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    if (entry.path) paths.push(entry.path);
    if (includeOriginal && entry.originalPath) paths.push(entry.originalPath);
  }
  return paths;
}
