import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildInventory,
  discoverUnits,
  findComposeFiles,
  parseComposeServices,
} from '../plugins/architecture-map/skills/architecture-map/runtime/inventory';
import { SAMPLE_REPO } from './helpers';

const inv = buildInventory(SAMPLE_REPO);

describe('compose discovery', () => {
  test('finds compose files at the root and under infra-style folders', () => {
    expect(findComposeFiles(SAMPLE_REPO).map((f) => f.replace(SAMPLE_REPO + '/', ''))).toEqual([
      'infra/compose.yaml',
    ]);
  });

  test('image-only services are infra; built services are processes', () => {
    const band = Object.fromEntries(inv.compose.map((s) => [s.id, s.band]));
    expect(band).toEqual({
      postgres: 'infra',
      redis: 'infra',
      rabbitmq: 'infra',
      api: 'process',
      web: 'process',
      adminer: 'infra',
    });
  });

  test('captures container_name, image, build context, working_dir', () => {
    const api = inv.compose.find((s) => s.id === 'api')!;
    expect(api.containerName).toBe('shop-api');
    expect(api.build).toBe('../apps/api');
    expect(api.workingDir).toBe('/app');
    expect(api.image).toBeNull();
    const web = inv.compose.find((s) => s.id === 'web')!;
    expect(web.build).toBe('../apps/web');
    expect(inv.compose.find((s) => s.id === 'postgres')!.image).toBe('postgres:16-alpine');
  });

  test('links built services to the unit their build context points at', () => {
    expect(inv.compose.find((s) => s.id === 'api')!.unit).toBe('api');
    expect(inv.compose.find((s) => s.id === 'web')!.unit).toBe('web');
    expect(inv.compose.find((s) => s.id === 'postgres')!.unit).toBeNull();
    expect(inv.composeFiles).toEqual(['infra/compose.yaml']);
  });

  test('refs: which other services a block names (depends_on, env URLs)', () => {
    const refs = Object.fromEntries(inv.compose.map((s) => [s.id, s.refs]));
    expect(refs.api).toEqual(['postgres', 'rabbitmq']);
    expect(refs.web).toEqual(['api']);
    expect(refs.postgres).toEqual([]);
    expect(refs.adminer).toEqual([]);
  });

  test('a stock image with working_dir inside a code unit is a process, not infra', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-workdir-'));
    try {
      writeFileSync(join(dir, 'package.json'), '{"name":"mono","workspaces":["apps/*"]}');
      mkdirSync(join(dir, 'apps/server/src'), { recursive: true });
      writeFileSync(join(dir, 'apps/server/package.json'), '{}');
      writeFileSync(
        join(dir, 'compose.yaml'),
        [
          'services:',
          '  server:',
          '    image: oven/bun:1-slim',
          '    working_dir: /app/apps/server',
          '    command: ["bun", "run", "dev"]',
          '  cache:',
          '    image: redis:7',
          '',
        ].join('\n')
      );
      const local = buildInventory(dir);
      const server = local.compose.find((s) => s.id === 'server')!;
      expect(server.band).toBe('process');
      expect(server.unit).toBe('server');
      expect(local.compose.find((s) => s.id === 'cache')!.band).toBe('infra');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('several stacks: the dev/local directory wins, siblings merge, the rest are reported', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-stacks-'));
    try {
      const write = (p: string, services: string[]) => {
        mkdirSync(join(dir, p, '..'), { recursive: true });
        writeFileSync(
          join(dir, p),
          'services:\n' + services.map((s) => `  ${s}:\n    image: ${s}:1\n`).join('')
        );
      };
      write('infra/dev/compose.yaml', ['db', 'queue']);
      write('infra/dev/compose.extra.yaml', ['search']);
      write('infra/prod/compose.yaml', ['db', 'edge']);
      write('infra/test/compose.test.yaml', ['runner']);
      write('.devcontainer/docker-compose.yml', ['devbox']);
      const stacks = buildInventory(dir);
      expect(stacks.composeFiles).toEqual(['infra/dev/compose.extra.yaml', 'infra/dev/compose.yaml']);
      expect(stacks.compose.map((s) => s.id).sort()).toEqual(['db', 'queue', 'search']);
      const note = stacks.findings.find((f) => f.startsWith('other compose stacks exist'))!;
      expect(note).toContain('infra/prod/compose.yaml');
      expect(note).toContain('.devcontainer/docker-compose.yml');
      expect(note).toContain('--compose');

      const prod = buildInventory(dir, { composeFiles: ['infra/prod/compose.yaml'] });
      expect(prod.composeFiles).toEqual(['infra/prod/compose.yaml']);
      expect(prod.compose.map((s) => s.id)).toEqual(['db', 'edge']);
      expect(prod.findings.some((f) => f.startsWith('other compose stacks'))).toBe(false);

      expect(() => buildInventory(dir, { composeFiles: ['infra/nope.yaml'] })).toThrow(
        /compose file not found/
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a root compose file beats every subdirectory stack', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-rootstack-'));
    try {
      writeFileSync(join(dir, 'compose.yaml'), 'services:\n  app:\n    build: .\n');
      mkdirSync(join(dir, 'infra/dev'), { recursive: true });
      writeFileSync(join(dir, 'infra/dev/compose.yaml'), 'services:\n  other:\n    image: x:1\n');
      expect(buildInventory(dir).composeFiles).toEqual(['compose.yaml']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('parser tolerates comments, quotes, nested build without context, and other top-level keys', () => {
    const text = `
version: "3.9"   # legacy key
volumes:
  data: {}
services:
  # the database
  db:
    image: "postgres:16"  # pinned
  worker:
    build:
      dockerfile: Dockerfile.worker
    container_name: 'my-worker'
  edge:
    build: .
networks:
  default: {}
`;
    const services = parseComposeServices(text, 'compose.yaml');
    expect(services.map((s) => [s.id, s.band, s.image, s.build, s.containerName])).toEqual([
      ['db', 'infra', 'postgres:16', null, null],
      ['worker', 'process', null, '.', 'my-worker'],
      ['edge', 'process', null, '.', null],
    ]);
  });

  test('nested unit paths get their last segment as id unless that collides', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-nested-'));
    try {
      writeFileSync(
        join(dir, 'package.json'),
        '{"name":"n","workspaces":["packages/*","packages/tools/plugins/*"]}'
      );
      for (const p of ['packages/core', 'packages/tools/plugins/core', 'packages/tools/plugins/deep-tool']) {
        mkdirSync(join(dir, p, 'src'), { recursive: true });
        writeFileSync(join(dir, p, 'package.json'), '{}');
      }
      const ids = discoverUnits(dir).map((u) => [u.id, u.path]);
      expect(ids).toEqual([
        ['core', 'packages/core'],
        ['packages-tools-plugins-core', 'packages/tools/plugins/core'],
        ['deep-tool', 'packages/tools/plugins/deep-tool'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('units', () => {
  test('workspace globs expand to apps and packages with kind and layout', () => {
    const byId = Object.fromEntries(inv.units.map((u) => [u.id, u]));
    expect(Object.keys(byId).sort()).toEqual(['api', 'shared', 'web']);
    expect(byId.api.kind).toBe('app');
    expect(byId.api.layout).toBe('layered');
    expect(byId.api.hasDockerfile).toBe(true);
    expect(byId.api.manifest).toBe('apps/api/package.json');
    expect(byId.web.layout).toBe('routes');
    expect(byId.web.markers).toEqual(['apps/web/src/routes']);
    expect(byId.shared.kind).toBe('package');
    expect(byId.shared.layout).toBe('library');
  });

  test('records unit directories two levels deep for membership checks', () => {
    const web = inv.units.find((u) => u.id === 'web')!;
    expect(web.dirs).toContain('src');
    expect(web.dirs).toContain('src/routes');
    expect(web.dirs).toContain('src/lib');
    expect(web.dirs).not.toContain('src/routes/orders');
  });

  test('layered markers point at real layer directories', () => {
    const api = inv.units.find((u) => u.id === 'api')!;
    for (const m of api.markers) expect(m).toMatch(/\/(domain|application|infrastructure)$/);
  });
});

describe('features', () => {
  test('finds feature folders under src/features with layer flags and dirs', () => {
    const names = inv.features.map((f) => `${f.unit}/${f.name}`).sort();
    expect(names).toEqual(['api/billing', 'api/orders']);
    const orders = inv.features.find((f) => f.name === 'orders')!;
    expect(orders.layers).toEqual({ domain: true, application: true, infrastructure: true });
    expect(orders.dirs).toEqual(['application', 'domain', 'infrastructure']);
    const billing = inv.features.find((f) => f.name === 'billing')!;
    expect(billing.layers.domain).toBe(false);
  });

  test('classifies files by their position inside the feature, not the repo path', () => {
    const orders = inv.features.find((f) => f.name === 'orders')!;
    expect(orders.files.routes).toEqual([
      'apps/api/src/features/orders/infrastructure/http/orders.routes.ts',
    ]);
    expect(orders.files.persistence).toEqual([
      'apps/api/src/features/orders/infrastructure/persistence/pg-order.repository.ts',
    ]);
    expect(orders.files.messaging).toContain(
      'apps/api/src/features/orders/infrastructure/messaging/outbox.relay.ts'
    );
    expect(orders.files.handlers).toContain(
      'apps/api/src/features/orders/application/create-order.use-case.ts'
    );
    expect(orders.files.jobs).toEqual([]);
  });

  test('test files are not listed as feature files', () => {
    for (const f of inv.features) {
      for (const list of Object.values(f.files)) {
        for (const p of list) expect(p).not.toMatch(/__tests__|\.test\.|\.spec\./);
      }
    }
  });
});

describe('inventory document', () => {
  test('is versioned, absolute-rooted, and has no findings for the sample repo', () => {
    expect(inv.schemaVersion).toBe(1);
    expect(inv.repoRoot).toBe(SAMPLE_REPO);
    expect(inv.findings).toEqual([]);
  });

  test('an empty repository yields a root unit and honest findings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-empty-'));
    try {
      writeFileSync(join(dir, 'README.md'), '# nothing here\n');
      const empty = buildInventory(dir);
      expect(empty.compose).toEqual([]);
      expect(empty.units).toHaveLength(1);
      expect(empty.units[0].kind).toBe('root');
      expect(empty.units[0].layout).toBe('unknown');
      expect(empty.findings.some((f) => f.startsWith('no compose file found'))).toBe(true);
      expect(empty.findings.some((f) => f.includes('repository root is the only code unit'))).toBe(true);
      expect(empty.findings.some((f) => f.includes('no recognisable layout'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a single-app repo with src/domain|application|infrastructure is one layered root unit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-single-'));
    try {
      for (const d of ['src/domain', 'src/application', 'src/infrastructure']) {
        mkdirSync(join(dir, d), { recursive: true });
      }
      writeFileSync(join(dir, 'package.json'), '{"name":"single"}');
      writeFileSync(join(dir, 'docker-compose.yml'), 'services:\n  app:\n    build: .\n  db:\n    image: postgres\n');
      const single = buildInventory(dir);
      expect(single.units.map((u) => [u.kind, u.layout])).toEqual([['root', 'layered']]);
      expect(single.compose.map((s) => [s.id, s.band])).toEqual([
        ['app', 'process'],
        ['db', 'infra'],
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('pnpm and Cargo workspaces are read as unit patterns', () => {
    const dir = mkdtempSync(join(tmpdir(), 'am-ws-'));
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - "services/*"\n  - "!services/skip"\n');
      writeFileSync(join(dir, 'Cargo.toml'), '[workspace]\nmembers = ["crates/core", "crates/cli"]\n');
      for (const d of ['services/gateway/src/routes', 'services/skip/src', 'crates/core/src', 'crates/cli/src']) {
        mkdirSync(join(dir, d), { recursive: true });
      }
      writeFileSync(join(dir, 'services/gateway/package.json'), '{}');
      writeFileSync(join(dir, 'services/skip/package.json'), '{}');
      writeFileSync(join(dir, 'crates/core/Cargo.toml'), '[package]\nname="core"\n');
      writeFileSync(join(dir, 'crates/cli/Cargo.toml'), '[package]\nname="cli"\n');
      const units = discoverUnits(dir);
      const ids = units.map((u) => u.id).sort();
      // `services/*` also matches skip (negations are ignored, not applied); it is a real dir.
      expect(ids).toEqual(['cli', 'core', 'gateway', 'skip']);
      expect(units.find((u) => u.id === 'gateway')!.layout).toBe('routes');
      expect(units.find((u) => u.id === 'core')!.kind).toBe('package');
      expect(units.find((u) => u.id === 'core')!.manifest).toBe('crates/core/Cargo.toml');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
