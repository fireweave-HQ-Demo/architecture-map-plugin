/**
 * Inject a MapDocument into the locked HTML shell. Agents do not author HTML.
 * The shell is the only visual surface; everything visible comes from JSON.
 */

import { resolve } from 'node:path';

import type { MapDocument } from '../schema';

export const SHELL_MARKER = '__MAP_JSON__';
export const SHELL_FINGERPRINT = '--accent: #4f46e5';
export const SHELL_DATA_ATTR = 'data-shell="architecture-map-interactive"';
export const SHELL_FILENAME = 'shell.html';

const REPO_ROOT_ATTR = 'data-repo-root=""';

/** Absolute path of the shell that ships next to this file. */
export function shellPath(runtimeDir: string = import.meta.dir): string {
  return resolve(runtimeDir, SHELL_FILENAME);
}

export function assertLockedShell(shell: string, where: string): void {
  if (!shell.includes(SHELL_MARKER)) {
    throw new Error(`Locked shell missing ${SHELL_MARKER}: ${where}`);
  }
  if (shell.split(SHELL_MARKER).length - 1 !== 1) {
    throw new Error(
      `Locked shell must contain ${SHELL_MARKER} exactly once: ${where}`
    );
  }
  if (!shell.includes(SHELL_FINGERPRINT) || !shell.includes(SHELL_DATA_ATTR)) {
    throw new Error(`Locked shell lost its visual tokens: ${where}`);
  }
}

export async function loadShell(runtimeDir?: string): Promise<string> {
  const path = shellPath(runtimeDir);
  const shell = await Bun.file(path).text();
  assertLockedShell(shell, path);
  return shell;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export interface InjectOptions {
  /**
   * Absolute path of the repository the map describes. When set, file
   * references in the page become `vscode://file` links.
   */
  repoRoot?: string;
}

export function injectMap(
  shell: string,
  map: MapDocument,
  opts: InjectOptions = {}
): string {
  assertLockedShell(shell, 'inject');
  const json = JSON.stringify(map).replace(/</g, '\\u003c');
  let rendered = shell.replace(SHELL_MARKER, json);
  if (opts.repoRoot) {
    if (!rendered.includes(REPO_ROOT_ATTR)) {
      throw new Error('Locked shell missing data-repo-root=""');
    }
    rendered = rendered.replace(
      REPO_ROOT_ATTR,
      `data-repo-root="${escapeAttr(resolve(opts.repoRoot))}"`
    );
  }
  if (rendered.includes(SHELL_MARKER)) {
    throw new Error('Shell still contains the JSON placeholder after inject');
  }
  if (!rendered.includes(SHELL_FINGERPRINT)) {
    throw new Error('Emit is not the locked shell (fingerprint missing)');
  }
  return rendered;
}
