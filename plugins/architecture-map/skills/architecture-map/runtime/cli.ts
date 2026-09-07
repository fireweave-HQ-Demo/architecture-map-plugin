#!/usr/bin/env bun
/**
 * architecture-map runtime CLI.
 *
 *   bun cli.ts init      --root <dir> [--out-dir <dir>] [--name <title>] [--compose <file>]...
 *   bun cli.ts inventory --root <dir> [--out <inventory.json>] [--compose <file>]...
 *   bun cli.ts validate  --in <map.json> [--inventory <inventory.json>]
 *   bun cli.ts render    --in <map.json> --out <file.html> [--repo-root <dir>] [--inventory <inventory.json>]
 *   bun cli.ts merge-pr  --before <hops.json> --after <hops.json> [--out <hops.json>]
 *   bun cli.ts fixtures  [--out-dir <dir>]        render every bundled golden map
 *
 * `init` writes inventory.json, repo.map.json and repo.html into --out-dir
 * (default <root>/.architecture-map) and appends `.architecture-map/` to
 * the repository `.gitignore` when that path is not already ignored. The
 * repo map is drafted mechanically from the inventory; every box and file
 * on it exists on disk.
 *
 * Exit codes: 0 ok · 1 the map or inventory is not valid · 2 usage error.
 * Everything is deterministic and offline; no network, no model calls.
 */

import { mkdir, readdir } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import {
  ARCHITECTURE_MAP_DIR,
  ARCHITECTURE_MAP_GITIGNORE,
  ensureArchitectureMapGitignored,
} from './gitignore';
import { buildInventory, type Inventory } from './inventory';
import { mechanicalPlanIssues } from './modes/plan';
import { mergePrHops, type PrTraceHop } from './modes/pr';
import { draftRepoMap } from './modes/repo';
import { injectMap, loadShell } from './render/inject';
import {
  parseMapDocument,
  validateMapDocument,
  type MapDocument,
  type MapValidationIssue,
} from './schema';

/** Where `init` writes, relative to the repository root. */
export const DEFAULT_OUT_DIR = ARCHITECTURE_MAP_DIR;

const USAGE = `architecture-map runtime

Usage:
  bun cli.ts init      --root <dir> [--out-dir <dir>] [--name <title>] [--compose <file>]...
  bun cli.ts inventory --root <dir> [--out <inventory.json>] [--compose <file>]...
  bun cli.ts validate  --in <map.json> [--inventory <inventory.json>]
  bun cli.ts render    --in <map.json> --out <file.html> [--repo-root <dir>] [--inventory <inventory.json>]
  bun cli.ts merge-pr  --before <hops.json> --after <hops.json> [--out <hops.json>]
  bun cli.ts fixtures  [--out-dir <dir>]

init writes <out-dir>/inventory.json, repo.map.json and repo.html
(out-dir defaults to <root>/${DEFAULT_OUT_DIR}) and adds
${ARCHITECTURE_MAP_GITIGNORE} to <root>/.gitignore if missing. When the
repository has several compose stacks the dev/local one is chosen;
--compose overrides.

Exit codes: 0 ok, 1 invalid map/inventory, 2 usage.
`;

class UsageError extends Error {}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i === -1) return undefined;
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new UsageError(`${name} needs a value`);
  }
  return value;
}

/** Every value of a repeatable flag, in order. */
function flags(argv: string[], name: string): string[] {
  const out: string[] = [];
  argv.forEach((arg, i) => {
    if (arg !== name) return;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new UsageError(`${name} needs a value`);
    out.push(value);
  });
  return out;
}

function has(argv: string[], name: string): boolean {
  return argv.includes(name);
}

async function readJson(path: string): Promise<unknown> {
  const abs = resolve(path);
  const file = Bun.file(abs);
  if (!(await file.exists())) throw new UsageError(`no such file: ${abs}`);
  try {
    return JSON.parse(await file.text());
  } catch (err) {
    throw new Error(`${abs} is not valid JSON: ${(err as Error).message}`);
  }
}

async function writeOut(path: string, text: string): Promise<string> {
  const abs = resolve(path);
  await mkdir(dirname(abs), { recursive: true });
  await Bun.write(abs, text);
  return abs;
}

function printIssues(label: string, issues: MapValidationIssue[]): void {
  console.error(`${label}: ${issues.length} issue${issues.length === 1 ? '' : 's'}`);
  for (const issue of issues) console.error(`  ${issue.path}: ${issue.message}`);
}

function asInventory(raw: unknown, where: string): Inventory {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !Array.isArray((raw as Inventory).compose) ||
    !Array.isArray((raw as Inventory).units)
  ) {
    throw new Error(`${where} is not an inventory (expected compose[] and units[])`);
  }
  return raw as Inventory;
}

/** Schema issues plus, when an inventory is given, mechanical plan issues. */
export async function validateWithInventory(
  raw: unknown,
  inventoryPath?: string
): Promise<{ issues: MapValidationIssue[]; map: MapDocument | null }> {
  const issues = validateMapDocument(raw);
  if (issues.length) return { issues, map: null };
  const map = raw as MapDocument;
  if (inventoryPath) {
    const inv = asInventory(await readJson(inventoryPath), inventoryPath);
    issues.push(...mechanicalPlanIssues(map, inv));
  }
  return { issues, map: issues.length ? null : map };
}

async function cmdInit(argv: string[]): Promise<number> {
  const root = resolve(flag(argv, '--root') ?? process.cwd());
  const outDir = resolve(flag(argv, '--out-dir') ?? join(root, DEFAULT_OUT_DIR));
  const inv = buildInventory(root, { composeFiles: flags(argv, '--compose') });
  const map = draftRepoMap(inv, { name: flag(argv, '--name') });
  const issues = validateMapDocument(map);
  if (issues.length) {
    // The drafter is meant to always satisfy the schema; surface any gap loudly.
    printIssues('drafted repo map', issues);
    return 1;
  }
  const shell = await loadShell();
  const wrote = [
    await writeOut(join(outDir, 'inventory.json'), JSON.stringify(inv, null, 2) + '\n'),
    await writeOut(join(outDir, 'repo.map.json'), JSON.stringify(map, null, 2) + '\n'),
    await writeOut(join(outDir, 'repo.html'), injectMap(shell, map, { repoRoot: root })),
  ];
  const gitignore = await ensureArchitectureMapGitignored(root);
  process.stdout.write(wrote.join('\n') + '\n');
  if (gitignore === 'added') {
    process.stdout.write(
      `gitignore: added ${ARCHITECTURE_MAP_GITIGNORE} to ${join(root, '.gitignore')}\n`
    );
  }
  process.stdout.write(
    `surface: ${map.infra.length} infra · ${map.processes.length} processes · ${map.columns.length} columns · ${
      (map.findings ?? []).length
    } findings\n`
  );
  return 0;
}

async function cmdInventory(argv: string[]): Promise<number> {
  const root = flag(argv, '--root') ?? process.cwd();
  const inv = buildInventory(root, { composeFiles: flags(argv, '--compose') });
  const text = JSON.stringify(inv, null, 2) + '\n';
  const out = flag(argv, '--out');
  if (out) {
    const abs = await writeOut(out, text);
    process.stdout.write(`${abs}\n`);
  } else {
    process.stdout.write(text);
  }
  return 0;
}

async function cmdValidate(argv: string[]): Promise<number> {
  const inPath = flag(argv, '--in');
  if (!inPath) throw new UsageError('validate needs --in <map.json>');
  const raw = await readJson(inPath);
  const { issues } = await validateWithInventory(raw, flag(argv, '--inventory'));
  if (issues.length) {
    printIssues(resolve(inPath), issues);
    return 1;
  }
  const map = raw as MapDocument;
  process.stdout.write(
    `ok ${resolve(inPath)} (${map.query.mode} · ${map.hops.length} hops)\n`
  );
  return 0;
}

async function cmdRender(argv: string[]): Promise<number> {
  const inPath = flag(argv, '--in');
  const outPath = flag(argv, '--out');
  if (!inPath || !outPath) {
    throw new UsageError('render needs --in <map.json> --out <file.html>');
  }
  const raw = await readJson(inPath);
  const { issues, map } = await validateWithInventory(raw, flag(argv, '--inventory'));
  if (issues.length || !map) {
    printIssues(resolve(inPath), issues);
    return 1;
  }
  const shell = await loadShell();
  const html = injectMap(shell, map, {
    repoRoot: flag(argv, '--repo-root') ?? process.cwd(),
  });
  const abs = await writeOut(outPath, html);
  process.stdout.write(`${abs}\n`);
  return 0;
}

function asTrace(raw: unknown, where: string): PrTraceHop[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { hops?: unknown }).hops)
      ? (raw as { hops: unknown[] }).hops
      : null;
  if (!list) throw new Error(`${where} must be a hop array or {"hops": [...]}`);
  return list.map((h, i) => {
    if (!h || typeof h !== 'object') throw new Error(`${where}[${i}] is not a hop`);
    const { n: _n, status: _s, beforeWork: _b, ...rest } = h as PrTraceHop & {
      n?: unknown;
      status?: unknown;
      beforeWork?: unknown;
    };
    return rest as PrTraceHop;
  });
}

async function cmdMergePr(argv: string[]): Promise<number> {
  const beforePath = flag(argv, '--before');
  const afterPath = flag(argv, '--after');
  if (!beforePath || !afterPath) {
    throw new UsageError('merge-pr needs --before <hops.json> --after <hops.json>');
  }
  const before = asTrace(await readJson(beforePath), beforePath);
  const after = asTrace(await readJson(afterPath), afterPath);
  const merged = mergePrHops(before, after);
  const text = JSON.stringify(merged, null, 2) + '\n';
  const out = flag(argv, '--out');
  if (out) process.stdout.write(`${await writeOut(out, text)}\n`);
  else process.stdout.write(text);
  return 0;
}

async function cmdFixtures(argv: string[]): Promise<number> {
  const fixturesDir = resolve(import.meta.dir, 'fixtures');
  const outDir = resolve(flag(argv, '--out-dir') ?? join(fixturesDir, 'rendered'));
  const shell = await loadShell();
  const names = (await readdir(fixturesDir)).filter((f) => f.endsWith('.map.json'));
  let failures = 0;
  for (const name of names.sort()) {
    const raw = await readJson(join(fixturesDir, name));
    const issues = validateMapDocument(raw);
    if (issues.length) {
      printIssues(name, issues);
      failures += 1;
      continue;
    }
    const html = injectMap(shell, parseMapDocument(raw));
    const abs = await writeOut(
      join(outDir, basename(name).replace(/\.map\.json$/, '.html')),
      html
    );
    process.stdout.write(`${abs}\n`);
  }
  return failures ? 1 : 0;
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || has(argv, '--help') || has(argv, '-h')) {
    process.stdout.write(USAGE);
    return command ? 0 : 2;
  }
  switch (command) {
    case 'init':
      return cmdInit(rest);
    case 'inventory':
      return cmdInventory(rest);
    case 'validate':
      return cmdValidate(rest);
    case 'render':
      return cmdRender(rest);
    case 'merge-pr':
      return cmdMergePr(rest);
    case 'fixtures':
      return cmdFixtures(rest);
    default:
      throw new UsageError(`unknown command "${command}"`);
  }
}

if (import.meta.main) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof UsageError) {
        console.error(`usage: ${message}\n`);
        console.error(USAGE);
        process.exit(2);
      }
      console.error(message);
      process.exit(1);
    });
}
