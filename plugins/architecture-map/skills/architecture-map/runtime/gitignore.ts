/**
 * Keep generated maps out of git. `init` appends `.architecture-map/` to the
 * repository `.gitignore` when that path is not already ignored.
 */

import { join } from 'node:path';

/** Default `init` output directory, relative to the repository root. */
export const ARCHITECTURE_MAP_DIR = '.architecture-map';

/** Canonical `.gitignore` line for that directory. */
export const ARCHITECTURE_MAP_GITIGNORE = `${ARCHITECTURE_MAP_DIR}/`;

/** Spellings that already mean "this directory is ignored". */
const EQUIVALENTS = [
  ARCHITECTURE_MAP_DIR,
  ARCHITECTURE_MAP_GITIGNORE,
  `/${ARCHITECTURE_MAP_DIR}`,
  `/${ARCHITECTURE_MAP_GITIGNORE}`,
];

export function alreadyIgnoresArchitectureMap(text: string): boolean {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const pattern = line.startsWith('!') ? line.slice(1) : line;
    if (EQUIVALENTS.includes(pattern)) return true;
  }
  return false;
}

/**
 * Idempotent. Creates `.gitignore` when the file is missing.
 * Returns whether a line was written.
 */
export async function ensureArchitectureMapGitignored(
  root: string
): Promise<'added' | 'present'> {
  const path = join(root, '.gitignore');
  const file = Bun.file(path);
  const existing = (await file.exists()) ? await file.text() : '';
  if (alreadyIgnoresArchitectureMap(existing)) return 'present';
  const prefix = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  await Bun.write(path, `${existing}${prefix}${ARCHITECTURE_MAP_GITIGNORE}\n`);
  return 'added';
}
