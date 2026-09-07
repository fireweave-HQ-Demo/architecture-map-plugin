#!/usr/bin/env bun
/**
 * Keep the Claude Code and Cursor manifests in agreement without hand-editing
 * both files twice.
 *
 * The source of truth is the Claude Code manifest (Claude was first and its
 * shape is a superset). The Cursor manifest is projected from it:
 *
 *   .claude-plugin/plugin.json         source
 *   .cursor-plugin/plugin.json         derived: identical fields + displayName
 *   .claude-plugin/marketplace.json    source
 *   .cursor-plugin/marketplace.json    derived: the fields Cursor reads
 *
 * The plugin displayName is a Cursor-only field (Claude ignores it), so it is
 * kept alongside this script rather than in the Claude manifest.
 *
 * Usage:
 *   bun tools/sync-manifests.ts            # rewrite the derived files
 *   bun tools/sync-manifests.ts --check    # exit 1 if any derived file drifted
 *
 * Called by:  bun run sync           (writes)
 *             bun run sync:check     (verifies; also runs in CI and in `bun check`)
 */

import { resolve } from 'node:path';

const REPO_ROOT = resolve(import.meta.dir, '..');
const CLAUDE_PLUGIN_JSON = resolve(REPO_ROOT, 'plugins/architecture-map/.claude-plugin/plugin.json');
const CURSOR_PLUGIN_JSON = resolve(REPO_ROOT, 'plugins/architecture-map/.cursor-plugin/plugin.json');
const CLAUDE_MARKETPLACE_JSON = resolve(REPO_ROOT, '.claude-plugin/marketplace.json');
const CURSOR_MARKETPLACE_JSON = resolve(REPO_ROOT, '.cursor-plugin/marketplace.json');

/** Fields Cursor adds on top of the Claude plugin manifest. */
const CURSOR_PLUGIN_OVERRIDES = {
  displayName: 'Architecture Map',
} as const;

/**
 * Cursor's marketplace schema is a subset of Claude's — no `$schema`, no
 * per-plugin `author`/`category`/`keywords`. Everything else is projected
 * verbatim so the two files never disagree on a name, description, or path.
 */
function cursorMarketplace(claude: Record<string, unknown>): Record<string, unknown> {
  const plugins = (claude.plugins as Array<Record<string, unknown>>).map((p) => ({
    name: p.name,
    source: p.source,
    description: p.description,
  }));
  return {
    name: claude.name,
    description: claude.description,
    owner: claude.owner,
    plugins,
  };
}

/** Cursor plugin manifest = Claude's fields, in Claude's order, plus displayName after name. */
function cursorPlugin(claude: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(claude)) {
    out[key] = value;
    if (key === 'name') out.displayName = CURSOR_PLUGIN_OVERRIDES.displayName;
  }
  return out;
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(path).text());
}

/**
 * Match the shape hand-edited into the repo: 2-space indent, trailing newline.
 * `JSON.stringify` alone yields no trailing newline; keep the newline so
 * whitespace-linters and diff tools stay happy.
 */
function format(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

interface Target {
  path: string;
  actual: string;
  expected: string;
}

async function targets(): Promise<Target[]> {
  const claudePlugin = await readJson(CLAUDE_PLUGIN_JSON);
  const claudeMarket = await readJson(CLAUDE_MARKETPLACE_JSON);
  return [
    {
      path: CURSOR_PLUGIN_JSON,
      actual: await Bun.file(CURSOR_PLUGIN_JSON).text(),
      expected: format(cursorPlugin(claudePlugin)),
    },
    {
      path: CURSOR_MARKETPLACE_JSON,
      actual: await Bun.file(CURSOR_MARKETPLACE_JSON).text(),
      expected: format(cursorMarketplace(claudeMarket)),
    },
  ];
}

async function write(): Promise<number> {
  let wrote = 0;
  for (const t of await targets()) {
    if (t.actual === t.expected) continue;
    await Bun.write(t.path, t.expected);
    process.stdout.write(`wrote ${t.path}\n`);
    wrote += 1;
  }
  if (wrote === 0) process.stdout.write('manifests already in sync\n');
  return 0;
}

async function check(): Promise<number> {
  const drifted = (await targets()).filter((t) => t.actual !== t.expected);
  if (drifted.length === 0) {
    process.stdout.write('manifests in sync\n');
    return 0;
  }
  for (const t of drifted) {
    process.stderr.write(
      `drift: ${t.path}\n  run \`bun run sync\` to regenerate it from the Claude Code manifest\n`
    );
  }
  return 1;
}

export async function main(argv: string[]): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(
      'usage: bun tools/sync-manifests.ts [--check]\n' +
        '  no args : regenerate the Cursor manifests from the Claude Code ones\n' +
        '  --check : exit 1 if any derived manifest drifted (for CI)\n'
    );
    return 0;
  }
  return argv.includes('--check') ? check() : write();
}

if (import.meta.main) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
