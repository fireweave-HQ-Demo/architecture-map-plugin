import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildInventory } from '../plugins/architecture-map/skills/architecture-map/runtime/inventory';
import {
  draftRepoMap,
  MAX_LAYERS_PER_COLUMN,
} from '../plugins/architecture-map/skills/architecture-map/runtime/modes/repo';
import {
  parseMapDocument,
  validateMapDocument,
  type MapDocument,
} from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { loadFixture, SAMPLE_REPO } from './helpers';

const inv = buildInventory(SAMPLE_REPO);
const draft = draftRepoMap(inv, { generatedAt: '2026-09-07T10:00:00Z' });
const golden = parseMapDocument(await loadFixture('repo-sample.map.json'));

describe('draftRepoMap on the sample repo', () => {
  test('is a valid repo-mode map with no hops', () => {
    expect(validateMapDocument(draft)).toEqual([]);
    expect(draft.query.mode).toBe('repo');
    expect(draft.hops).toEqual([]);
    expect(draft.schemaVersion).toBe(1);
  });

  test('names the repo from the root manifest and says where it read from', () => {
    expect(draft.title).toBe('sample-shop — repository surface');
    expect(draft.query.name).toBe('sample-shop');
    expect(draft.intent).toContain('infra/compose.yaml');
    expect(draft.intent).toContain('3 manifests');
    expect(draftRepoMap(inv, { name: 'Shop' }).title).toBe('Shop — repository surface');
  });

  test('infra and processes are exactly the compose services, labelled from compose', () => {
    expect(draft.infra.map((n) => n.id)).toEqual(['postgres', 'redis', 'rabbitmq', 'adminer']);
    expect(draft.infra[0].label).toBe('postgres (postgres:16-alpine)');
    expect(draft.processes.map((n) => n.label)).toEqual(['api — apps/api', 'web — apps/web']);
    for (const n of [...draft.infra, ...draft.processes]) expect(n.used).toBe(true);
  });

  test('one column per feature, one per support dir, one per feature-less unit', () => {
    expect(draft.columns.map((c) => [c.id, c.kind])).toEqual([
      ['api/billing', 'layered'],
      ['api/orders', 'layered'],
      ['api/shared', 'library'],
      ['web/src', 'routes'],
      ['shared/src', 'library'],
    ]);
    const orders = draft.columns.find((c) => c.id === 'api/orders')!;
    expect(orders.layers.map((l) => l.label)).toEqual(['application', 'domain', 'infrastructure']);
    const shared = draft.columns.find((c) => c.id === 'shared/src')!;
    expect(shared.layers).toHaveLength(1);
    expect(shared.layers[0].label).toBe('files');
    expect(shared.layers[0].files).toEqual([
      'packages/shared/src/index.ts',
      'packages/shared/src/order-schema.ts',
    ]);
  });

  test('every listed file exists and no test file is listed', () => {
    for (const col of draft.columns) {
      for (const layer of col.layers) {
        expect(layer.files.length).toBeGreaterThan(0);
        for (const f of layer.files) {
          expect(existsSync(join(SAMPLE_REPO, f)), f).toBe(true);
          expect(f).not.toMatch(/__tests__|\.test\.|\.spec\./);
        }
      }
    }
  });

  test('findings: partial layer sets and infra nothing points at, never a grade', () => {
    const ids = draft.findings!.map((f) => f.id);
    expect(ids).toEqual(['api-billing-layers', 'redis-unreferenced', 'adminer-unreferenced']);
    for (const f of draft.findings!) expect(f.severity).toBe('info');
    // postgres and rabbitmq are wired from the api service block, so not flagged.
    expect(ids).not.toContain('postgres-unreferenced');
    expect(ids).not.toContain('rabbitmq-unreferenced');
    const billing = draft.findings!.find((f) => f.id === 'api-billing-layers')!;
    expect(billing.nodeId).toBe('api/billing');
    expect(billing.title).toBe('billing has application and infrastructure but no domain layer');
  });

  test('grounding lists compose, the workspace manifest, unit manifests and Dockerfiles', () => {
    expect(draft.grounding.map((g) => g.path)).toEqual([
      'infra/compose.yaml',
      'package.json',
      'apps/api/package.json',
      'apps/api/Dockerfile',
      'apps/web/package.json',
      'apps/web/Dockerfile',
      'packages/shared/package.json',
    ]);
  });

  test('the bundled repo golden is the draft plus curated findings, grounding and unknowns', () => {
    const strip = (m: MapDocument) => ({
      ...m,
      findings: undefined,
      grounding: undefined,
      unknown: undefined,
    });
    expect(strip(golden)).toEqual(strip(draft));
    for (const f of draft.findings!) expect(golden.findings).toContainEqual(f);
    for (const g of draft.grounding) expect(golden.grounding).toContainEqual(g);
  });
});

describe('draftRepoMap on other shapes', () => {
  test('no compose: app units become processes, nothing is invented for infra', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-repo-nocompose-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"bare","workspaces":["apps/*"]}');
      mkdirSync(join(dir, 'apps/svc/src/routes'), { recursive: true });
      writeFileSync(join(dir, 'apps/svc/package.json'), '{}');
      writeFileSync(join(dir, 'apps/svc/src/routes/index.ts'), 'export {}\n');
      writeFileSync(join(dir, 'apps/svc/src/routes/index.test.ts'), 'export {}\n');
      const map = draftRepoMap(buildInventory(dir), { generatedAt: '2026-01-01T00:00:00Z' });
      expect(validateMapDocument(map)).toEqual([]);
      expect(map.infra).toEqual([]);
      expect(map.processes).toEqual([{ id: 'svc', used: true, label: 'svc — apps/svc' }]);
      expect(map.columns.map((c) => c.id)).toEqual(['svc/src']);
      expect(map.columns[0].layers[0].files).toEqual(['apps/svc/src/routes/index.ts']);
      expect(map.intent).toContain('no compose file');
      expect(map.findings!.some((f) => f.detail.startsWith('no compose file found'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a flat single-unit repo draws the root as one column', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-repo-flat-'));
    try {
      writeFileSync(join(dir, 'go.mod'), 'module example.com/tool\n');
      mkdirSync(join(dir, 'cmd/tool'), { recursive: true });
      mkdirSync(join(dir, 'internal/store'), { recursive: true });
      writeFileSync(join(dir, 'cmd/tool/main.go'), 'package main\n');
      writeFileSync(join(dir, 'internal/store/store.go'), 'package store\n');
      const map = draftRepoMap(buildInventory(dir), { generatedAt: '2026-01-01T00:00:00Z' });
      expect(validateMapDocument(map)).toEqual([]);
      expect(map.columns).toHaveLength(1);
      expect(map.columns[0].kind).toBe('unknown');
      expect(map.columns[0].layers.map((l) => l.label)).toEqual(['store']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('columns with many directories are capped and the rest named in a finding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-repo-wide-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"wide"}');
      for (let i = 0; i < MAX_LAYERS_PER_COLUMN + 3; i++) {
        const d = join(dir, 'src', `area-${String(i).padStart(2, '0')}`);
        mkdirSync(d, { recursive: true });
        writeFileSync(join(d, 'index.ts'), 'export {}\n');
      }
      const map = draftRepoMap(buildInventory(dir), { generatedAt: '2026-01-01T00:00:00Z' });
      expect(validateMapDocument(map)).toEqual([]);
      expect(map.columns[0].layers).toHaveLength(MAX_LAYERS_PER_COLUMN);
      const overflow = map.findings!.find((f) => f.id === 'layers-not-drawn')!;
      expect(overflow.title).toContain('3 directories not drawn');
      expect(overflow.detail).toContain('src/area-12');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
