import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import type { MapDocument } from '../plugins/architecture-map/skills/architecture-map/runtime/schema';

export const REPO_ROOT = resolve(import.meta.dir, '..');
export const PLUGIN_DIR = resolve(REPO_ROOT, 'plugins/architecture-map');
export const SKILL_DIR = resolve(PLUGIN_DIR, 'skills/architecture-map');
export const RUNTIME_DIR = resolve(SKILL_DIR, 'runtime');
export const FIXTURES_DIR = resolve(RUNTIME_DIR, 'fixtures');
export const SAMPLE_REPO = resolve(import.meta.dir, 'sample-repo');
export const CLI = resolve(RUNTIME_DIR, 'cli.ts');

export function fixtureNames(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.map.json'))
    .sort();
}

export async function loadFixture(name: string): Promise<unknown> {
  return JSON.parse(await Bun.file(resolve(FIXTURES_DIR, name)).text());
}

export async function loadAllFixtures(): Promise<Array<{ name: string; raw: unknown }>> {
  const out: Array<{ name: string; raw: unknown }> = [];
  for (const name of fixtureNames()) out.push({ name, raw: await loadFixture(name) });
  return out;
}

/** Deep clone so a test can mutate a golden without touching the others. */
export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function asMap(raw: unknown): MapDocument {
  return raw as MapDocument;
}

export async function runCli(
  args: string[],
  opts: { cwd?: string } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    cwd: opts.cwd ?? REPO_ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  return { code, stdout, stderr };
}
