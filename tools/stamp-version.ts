#!/usr/bin/env bun
/**
 * Write a release version into every manifest that carries one.
 *
 * The committed source keeps `SENTINEL` everywhere (root `package.json`,
 * Claude Code plugin manifest, skill frontmatter). The release tag is the
 * sole source of truth for the version, and this tool stamps that value
 * into the source right before publish. The Cursor manifest is not touched
 * directly — it is regenerated from the Claude one by `bun run sync`
 * after this tool runs.
 *
 * Usage:
 *   bun tools/stamp-version.ts --version 1.3.0
 *   bun tools/stamp-version.ts --from-tag          # reads $GITHUB_REF_NAME
 *   bun tools/stamp-version.ts --check --version 1.3.0
 *
 * Called by:  bun run stamp <version>           (locally, rare)
 *             .github/workflows/publish.yml      (on tag push)
 *
 * Exit codes: 0 ok · 1 stamp failed · 2 usage / invalid semver.
 */

import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');

/** The one string that means "not yet released" in every manifest. */
export const SENTINEL = '0.0.0-dev';

/** Strict semver: MAJOR.MINOR.PATCH, with optional pre-release / build. */
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface Target {
  path: string;
  /** Return the current version (before stamping). */
  read: (text: string) => string | null;
  /** Write the version into the file text; must be idempotent. */
  write: (text: string, version: string) => string;
}

const TARGETS: Target[] = [
  {
    path: resolve(REPO_ROOT, 'package.json'),
    read: (t) => matchJsonVersion(t),
    write: (t, v) => replaceJsonVersion(t, v),
  },
  {
    path: resolve(REPO_ROOT, 'plugins/architecture-map/.claude-plugin/plugin.json'),
    read: (t) => matchJsonVersion(t),
    write: (t, v) => replaceJsonVersion(t, v),
  },
  {
    path: resolve(REPO_ROOT, 'plugins/architecture-map/skills/architecture-map/SKILL.md'),
    read: (t) => matchSkillVersion(t),
    write: (t, v) => replaceSkillVersion(t, v),
  },
];

/**
 * Match the first `"version": "..."` in a JSON file. Every JSON we touch has
 * exactly one such field, at the top level, so this is intentionally strict
 * — we would rather fail than silently rewrite an unrelated `version` in
 * some nested object.
 */
function matchJsonVersion(text: string): string | null {
  const m = /^(?<indent>\s*)"version":\s*"(?<value>[^"]+)"/m.exec(text);
  return m?.groups?.value ?? null;
}

function replaceJsonVersion(text: string, version: string): string {
  return text.replace(
    /^(\s*)"version":\s*"[^"]+"/m,
    (_, indent) => `${indent}"version": "${version}"`
  );
}

/** SKILL.md carries the version as `  version: X` inside a YAML frontmatter. */
function matchSkillVersion(text: string): string | null {
  const m = /^  version:\s*(.+)$/m.exec(text);
  return m?.[1]?.trim() ?? null;
}

function replaceSkillVersion(text: string, version: string): string {
  return text.replace(/^(  version:\s*).+$/m, (_, prefix) => `${prefix}${version}`);
}

interface Result {
  path: string;
  before: string | null;
  after: string;
  changed: boolean;
}

async function stampAll(version: string): Promise<Result[]> {
  const results: Result[] = [];
  for (const target of TARGETS) {
    const before = await Bun.file(target.path).text();
    const currentVersion = target.read(before);
    const after = target.write(before, version);
    if (target.read(after) !== version) {
      throw new Error(
        `stamp: ${target.path} still reports ${target.read(after)} after write; the version field pattern may have changed`
      );
    }
    results.push({
      path: target.path,
      before: currentVersion,
      after: version,
      changed: before !== after,
    });
  }
  return results;
}

async function write(results: Result[]): Promise<void> {
  for (const r of results) {
    if (!r.changed) continue;
    // Re-read + re-write so `write` is authoritative (avoids stale content
    // if two runs happen in the same process — parallel-safe enough).
    const text = await Bun.file(r.path).text();
    const target = TARGETS.find((t) => t.path === r.path)!;
    await Bun.write(r.path, target.write(text, r.after));
  }
}

function parseVersion(argv: string[]): string {
  const flagIdx = argv.indexOf('--version');
  if (flagIdx !== -1) {
    const value = argv[flagIdx + 1];
    if (!value) throw new UsageError('--version needs a value');
    return normalize(value);
  }
  if (argv.includes('--from-tag')) {
    const tag = process.env.GITHUB_REF_NAME;
    if (!tag) throw new UsageError('--from-tag needs $GITHUB_REF_NAME (are we in a tag push?)');
    return normalize(tag);
  }
  throw new UsageError('need --version <semver> or --from-tag');
}

/** Strip a leading `v` (tags are conventionally `v1.3.0`, versions are `1.3.0`). */
function normalize(raw: string): string {
  const v = raw.startsWith('v') ? raw.slice(1) : raw;
  if (!SEMVER.test(v)) throw new UsageError(`not a semver: "${raw}"`);
  return v;
}

class UsageError extends Error {}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      'usage: bun tools/stamp-version.ts (--version <semver> | --from-tag) [--check]\n' +
        '  --version  explicit semver, with or without leading v\n' +
        '  --from-tag read from $GITHUB_REF_NAME (a v-prefixed tag)\n' +
        '  --check    do not write; exit 1 if any file would change\n'
    );
    return 0;
  }
  const version = parseVersion(argv);
  const results = await stampAll(version);
  const wouldChange = results.filter((r) => r.changed);

  if (argv.includes('--check')) {
    if (wouldChange.length === 0) {
      process.stdout.write(`all manifests already at ${version}\n`);
      return 0;
    }
    for (const r of wouldChange) {
      process.stderr.write(`drift: ${r.path} (currently ${r.before ?? 'unknown'}, expected ${version})\n`);
    }
    return 1;
  }

  await write(results);
  if (wouldChange.length === 0) {
    process.stdout.write(`no changes; every manifest already at ${version}\n`);
    return 0;
  }
  for (const r of wouldChange) {
    process.stdout.write(`${r.path}: ${r.before ?? 'unknown'} \u2192 ${r.after}\n`);
  }
  return 0;
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof UsageError) {
        console.error(`usage: ${message}`);
        process.exit(2);
      }
      console.error(message);
      process.exit(1);
    });
}
