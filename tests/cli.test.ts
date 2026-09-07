import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FIXTURES_DIR, SAMPLE_REPO, fixtureNames, runCli } from './helpers';

const tmp = mkdtempSync(join(tmpdir(), 'am-cli-'));
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }));

describe('cli', () => {
  test('no command prints usage and exits 2; help exits 0', async () => {
    const none = await runCli([]);
    expect(none.code).toBe(2);
    expect(none.stdout).toContain('Usage:');
    const help = await runCli(['help']);
    expect(help.code).toBe(0);
    const unknown = await runCli(['frobnicate']);
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain('unknown command');
  });

  test('init writes inventory, a valid repo map and its HTML into the out dir', async () => {
    const out = join(tmp, 'init-out');
    const res = await runCli(['init', '--root', SAMPLE_REPO, '--out-dir', out, '--name', 'Shop']);
    expect(res.code).toBe(0);
    for (const f of ['inventory.json', 'repo.map.json', 'repo.html']) {
      expect(existsSync(join(out, f)), f).toBe(true);
      expect(res.stdout).toContain(join(out, f));
    }
    expect(res.stdout).toContain('surface: 4 infra · 2 processes · 5 columns');
    const map = JSON.parse(await Bun.file(join(out, 'repo.map.json')).text());
    expect(map.query).toEqual({ mode: 'repo', name: 'Shop' });
    expect(map.hops).toEqual([]);
    const check = await runCli(['validate', '--in', join(out, 'repo.map.json')]);
    expect(check.code).toBe(0);
    const html = await Bun.file(join(out, 'repo.html')).text();
    expect(html).toContain('data-shell="architecture-map-interactive"');
    expect(html).toContain(`data-repo-root="${SAMPLE_REPO}"`);
    expect(html).toContain('Shop — repository surface');
  });

  test('init defaults its out dir to <root>/.architecture-map and honours --compose', async () => {
    const root = join(tmp, 'init-default');
    const { mkdirSync, writeFileSync, cpSync } = await import('node:fs');
    cpSync(SAMPLE_REPO, root, { recursive: true });
    mkdirSync(join(root, 'infra/prod'), { recursive: true });
    writeFileSync(join(root, 'infra/prod/compose.yaml'), 'services:\n  edge:\n    image: traefik:3\n');
    const res = await runCli(['init', '--root', root]);
    expect(res.code).toBe(0);
    expect(existsSync(join(root, '.architecture-map/repo.html'))).toBe(true);
    const dev = JSON.parse(await Bun.file(join(root, '.architecture-map/repo.map.json')).text());
    expect(dev.infra.map((n: { id: string }) => n.id)).not.toContain('edge');

    const prod = await runCli(['init', '--root', root, '--compose', 'infra/prod/compose.yaml']);
    expect(prod.code).toBe(0);
    const prodMap = JSON.parse(await Bun.file(join(root, '.architecture-map/repo.map.json')).text());
    expect(prodMap.infra.map((n: { id: string }) => n.id)).toEqual(['edge']);
  });

  test('inventory writes a versioned JSON document', async () => {
    const out = join(tmp, 'inventory.json');
    const res = await runCli(['inventory', '--root', SAMPLE_REPO, '--out', out]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(out);
    const inv = JSON.parse(await Bun.file(out).text());
    expect(inv.schemaVersion).toBe(1);
    expect(inv.compose.map((s: { id: string }) => s.id)).toContain('rabbitmq');
    expect(inv.units.map((u: { id: string }) => u.id).sort()).toEqual(['api', 'shared', 'web']);
  });

  test('inventory to stdout when --out is omitted', async () => {
    const res = await runCli(['inventory', '--root', SAMPLE_REPO]);
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).repoRoot).toBe(SAMPLE_REPO);
  });

  test('validate passes every golden, with and without the inventory', async () => {
    const inv = join(tmp, 'inv2.json');
    await runCli(['inventory', '--root', SAMPLE_REPO, '--out', inv]);
    for (const name of fixtureNames()) {
      const plain = await runCli(['validate', '--in', join(FIXTURES_DIR, name)]);
      expect(plain.code, name).toBe(0);
      expect(plain.stdout, name).toMatch(/^ok /);
      const withInv = await runCli(['validate', '--in', join(FIXTURES_DIR, name), '--inventory', inv]);
      expect(withInv.code, name).toBe(0);
    }
  });

  test('validate fails loudly on a broken map and on a missing file', async () => {
    const bad = join(tmp, 'bad.map.json');
    const raw = JSON.parse(await Bun.file(join(FIXTURES_DIR, 'flow-create-order.map.json')).text());
    raw.hops[0].type = 'Kafka';
    delete raw.intent;
    await Bun.write(bad, JSON.stringify(raw));
    const res = await runCli(['validate', '--in', bad]);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('2 issues');
    expect(res.stderr).toContain('hops[0].type');
    expect(res.stderr).toContain('intent: required');

    const missing = await runCli(['validate', '--in', join(tmp, 'nope.json')]);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain('no such file');
  });

  test('validate with inventory catches a plan that contradicts disk', async () => {
    const inv = join(tmp, 'inv3.json');
    await runCli(['inventory', '--root', SAMPLE_REPO, '--out', inv]);
    const raw = JSON.parse(
      await Bun.file(join(FIXTURES_DIR, 'plan-fail-orders-cache-cron.map.json')).text()
    );
    raw.infra.find((n: { id: string }) => n.id === 'redis').status = 'proposed';
    const bad = join(tmp, 'plan-bad.map.json');
    await Bun.write(bad, JSON.stringify(raw));
    const withInv = await runCli(['validate', '--in', bad, '--inventory', inv]);
    expect(withInv.code).toBe(1);
    expect(withInv.stderr).toContain('already exists on disk as infra');
    const without = await runCli(['validate', '--in', bad]);
    expect(without.code).toBe(0);
  });

  test('render writes the locked shell with the map and repo root embedded', async () => {
    const out = join(tmp, 'nested', 'flow.html');
    const res = await runCli([
      'render',
      '--in',
      join(FIXTURES_DIR, 'flow-create-order.map.json'),
      '--out',
      out,
      '--repo-root',
      SAMPLE_REPO,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(out);
    const html = await Bun.file(out).text();
    expect(html).toContain('data-shell="architecture-map-interactive"');
    expect(html).toContain(`data-repo-root="${SAMPLE_REPO}"`);
    expect(html).toContain('"mode":"flow"');
    expect(html).not.toContain('__MAP_JSON__');
  });

  test('render refuses an invalid map and writes nothing', async () => {
    const bad = join(tmp, 'bad2.map.json');
    await Bun.write(bad, JSON.stringify({ title: 'x' }));
    const out = join(tmp, 'should-not-exist.html');
    const res = await runCli(['render', '--in', bad, '--out', out]);
    expect(res.code).toBe(1);
    expect(existsSync(out)).toBe(false);
  });

  test('merge-pr classifies two traces and accepts {hops:[...]} or an array', async () => {
    const before = join(tmp, 'before.json');
    const after = join(tmp, 'after.json');
    const hop = (from: string, to: string, work: string) => ({
      from,
      to,
      type: 'HTTP',
      label: 'x',
      source: 's.ts',
      work,
    });
    await Bun.write(before, JSON.stringify({ hops: [hop('a', 'b', 'old'), hop('b', 'z', 'gone')] }));
    await Bun.write(after, JSON.stringify([hop('a', 'b', 'new'), hop('b', 'c', 'fresh')]));
    const res = await runCli(['merge-pr', '--before', before, '--after', after]);
    expect(res.code).toBe(0);
    const merged = JSON.parse(res.stdout);
    expect(merged.map((h: { status: string }) => h.status)).toEqual(['changed', 'added', 'removed']);
    expect(merged[0].beforeWork).toBe('old');
    expect(merged.map((h: { n: number }) => h.n)).toEqual([1, 2, 3]);
  });

  test('fixtures renders every bundled golden into the given directory', async () => {
    const outDir = join(tmp, 'rendered');
    const res = await runCli(['fixtures', '--out-dir', outDir]);
    expect(res.code).toBe(0);
    for (const name of fixtureNames()) {
      expect(existsSync(join(outDir, name.replace(/\.map\.json$/, '.html'))), name).toBe(true);
    }
  });
});
