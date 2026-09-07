import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  COLUMN_KINDS,
  MAX_CLAUSE,
  MAX_HOPS,
  MAX_LAYER_FILES,
  QUERY_MODES,
  TOUCH_TYPES,
  parseMapDocument,
  validateMapDocument,
  type MapDocument,
} from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { RUNTIME_DIR, SAMPLE_REPO, clone, loadAllFixtures, loadFixture } from './helpers';

const flow = (await loadFixture('flow-create-order.map.json')) as MapDocument;
const repo = (await loadFixture('repo-sample.map.json')) as MapDocument;
const planFail = (await loadFixture('plan-fail-orders-cache-cron.map.json')) as MapDocument;
const planBlocked = (await loadFixture('plan-blocked-missing-entry.map.json')) as MapDocument;
const prBlocked = (await loadFixture('pr-blocked-missing-flow.map.json')) as MapDocument;
const pr = (await loadFixture('pr-create-order-outbox.map.json')) as MapDocument;

function issuesOf(raw: unknown): string[] {
  return validateMapDocument(raw).map((i) => `${i.path}: ${i.message}`);
}

describe('vocabulary', () => {
  test('modes are exactly repo, flow, plan, pr', () => {
    expect([...QUERY_MODES]).toEqual(['repo', 'flow', 'plan', 'pr']);
  });

  test('touch types are generic mechanisms, not vendors', () => {
    const vendorish = /postgres|redis|kafka|rabbit|nats|restate|temporal|permify|vault|docker/i;
    for (const t of TOUCH_TYPES) expect(t).not.toMatch(vendorish);
    expect(TOUCH_TYPES).toContain('UNKNOWN');
  });

  test('shell legend vocabulary mirrors TOUCH_TYPES', async () => {
    const shell = await Bun.file(resolve(RUNTIME_DIR, 'shell.html')).text();
    const block = /const TOUCH_TYPE_NAMES = \[([\s\S]*?)\];/.exec(shell);
    expect(block).not.toBeNull();
    const names = [...block![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(names).toEqual([...TOUCH_TYPES]);
  });

  test('column kinds describe layout, not a framework', () => {
    expect([...COLUMN_KINDS]).toEqual(['layered', 'routes', 'library', 'unknown']);
  });
});

describe('goldens', () => {
  test('every bundled fixture is a valid map', async () => {
    for (const { name, raw } of await loadAllFixtures()) {
      expect(issuesOf(raw), name).toEqual([]);
    }
  });

  test('every fixture mode is represented, including both blocked shapes', async () => {
    const modes = (await loadAllFixtures()).map((f) => (f.raw as MapDocument).query.mode);
    for (const m of QUERY_MODES) expect(modes).toContain(m);
    expect(planBlocked.verdict).toBe('blocked');
    expect(prBlocked.hops).toEqual([]);
    expect(prBlocked.questions?.length).toBeGreaterThan(0);
  });

  test('every hop source and layer file exists in the sample repo', async () => {
    for (const { name, raw } of await loadAllFixtures()) {
      const map = raw as MapDocument;
      for (const hop of map.hops) {
        expect(existsSync(resolve(SAMPLE_REPO, hop.source)), `${name} hop ${hop.n}`).toBe(true);
      }
      for (const col of map.columns) {
        for (const layer of col.layers) {
          for (const f of layer.files) {
            expect(existsSync(resolve(SAMPLE_REPO, f)), `${name} ${layer.id} ${f}`).toBe(true);
          }
        }
      }
      for (const g of map.grounding) {
        expect(existsSync(resolve(SAMPLE_REPO, g.path)), `${name} grounding ${g.id}`).toBe(true);
      }
    }
  });

  test('golden work text is plain language (no identifiers, no schema names)', async () => {
    const jargon = /\b[a-z]+[A-Z][A-Za-z]+\(|\.safeParse\b|\bctx\.|\bawait\b|=>|\bnew [A-Z]/;
    for (const { name, raw } of await loadAllFixtures()) {
      for (const hop of (raw as MapDocument).hops) {
        expect(hop.work, `${name} hop ${hop.n}`).not.toMatch(jargon);
        if (hop.because) expect(hop.because, `${name} hop ${hop.n}`).not.toMatch(jargon);
        expect(hop.work.length).toBeLessThanOrEqual(MAX_CLAUSE);
      }
    }
  });

  test('node ids mirror disk: unit / feature / layer', () => {
    for (const col of flow.columns) {
      expect(col.id.split('/').length).toBeGreaterThanOrEqual(2);
      for (const layer of col.layers) expect(layer.id.startsWith(`${col.id}/`)).toBe(true);
    }
  });
});

describe('document shape', () => {
  test('requires schemaVersion 1', () => {
    const bad = clone(flow) as unknown as Record<string, unknown>;
    delete bad.schemaVersion;
    expect(issuesOf(bad)).toContain('schemaVersion: required: 1');
    bad.schemaVersion = 2;
    expect(issuesOf(bad)).toContain('schemaVersion: required: 1');
  });

  test('rejects an unknown touch type and an unknown column kind', () => {
    const bad = clone(flow);
    (bad.hops[0] as { type: string }).type = 'Kafka';
    (bad.columns[0] as { kind: string }).kind = 'sveltekit';
    const issues = issuesOf(bad);
    expect(issues.some((i) => i.startsWith('hops[0].type'))).toBe(true);
    expect(issues.some((i) => i.startsWith('columns[0].kind'))).toBe(true);
  });

  test('rejects duplicate ids across bands and unknown hop endpoints', () => {
    const bad = clone(flow);
    bad.columns[0].id = 'web';
    bad.hops[0].to = 'nowhere';
    const issues = issuesOf(bad);
    expect(issues).toContain('columns[0].id: duplicate id "web"');
    expect(issues).toContain('hops[0].to: unknown node "nowhere"');
  });

  test('caps hops and layer files', () => {
    const bad = clone(flow);
    while (bad.hops.length <= MAX_HOPS) {
      const last = bad.hops[bad.hops.length - 1];
      bad.hops.push({ ...last, n: bad.hops.length + 1 });
    }
    expect(issuesOf(bad).some((i) => i.includes(`at most ${MAX_HOPS} hops`))).toBe(true);

    const files = clone(flow);
    files.columns[0].layers[0].files = Array.from({ length: MAX_LAYER_FILES + 1 }, (_, i) => `f${i}.ts`);
    expect(issuesOf(files).some((i) => i.includes(`${MAX_LAYER_FILES} representative files`))).toBe(true);
  });

  test('hop numbering must be 1-based and contiguous', () => {
    const bad = clone(flow);
    bad.hops[2].n = 7;
    expect(issuesOf(bad)).toContain('hops[2].n: must be 3 (1-based, contiguous)');
  });

  test('work is required; in/out/fail/because/not must be non-empty when present', () => {
    const bad = clone(flow);
    (bad.hops[0] as { work?: string }).work = '';
    bad.hops[1].in = '   ';
    bad.hops[2].because = 'x'.repeat(300);
    const issues = issuesOf(bad);
    expect(issues.some((i) => i.startsWith('hops[0].work: required'))).toBe(true);
    expect(issues).toContain('hops[1].in: omit the field instead of an empty string');
    expect(issues).toContain('hops[2].because: must be ≤ 280 characters');
  });

  test('parseMapDocument throws with every issue listed', () => {
    const bad = clone(flow) as unknown as Record<string, unknown>;
    delete bad.title;
    delete bad.grounding;
    expect(() => parseMapDocument(bad)).toThrow(/title: required[\s\S]*grounding: required/);
  });
});

describe('repo mode', () => {
  test('repo map has no hops and may carry inventory findings', () => {
    expect(repo.hops).toEqual([]);
    expect(repo.findings?.length).toBeGreaterThan(0);
    expect(issuesOf(repo)).toEqual([]);
  });

  test('repo mode with hops is rejected — trace paths in flow mode', () => {
    const bad = clone(repo);
    bad.hops = [clone(flow.hops[0])];
    expect(issuesOf(bad).some((i) => i.includes('repo mode is the surface only'))).toBe(true);
  });

  test('repo and flow maps reject plan/pr-only fields', () => {
    const bad = clone(repo) as unknown as Record<string, unknown>;
    bad.verdict = 'pass';
    bad.compare = { base: 'main', head: 'x' };
    bad.questions = [{ id: 'q', ask: 'a', because: 'b' }];
    const issues = issuesOf(bad);
    expect(issues).toContain('verdict: verdict belongs to plan mode only');
    expect(issues).toContain('compare: compare belongs to pr mode only');
    expect(issues.some((i) => i.startsWith('questions:'))).toBe(true);
  });
});

describe('flow mode', () => {
  test('a flow needs at least one hop', () => {
    const bad = clone(flow);
    bad.hops = [];
    expect(issuesOf(bad).some((i) => i.includes('at least one hop required'))).toBe(true);
  });

  test('flow hops carry no status', () => {
    const bad = clone(flow);
    bad.hops[0].status = 'existing';
    expect(issuesOf(bad)).toContain(
      'hops[0].status: flow hops carry no status; status belongs to plan and pr modes'
    );
  });
});

describe('plan mode', () => {
  test('blocked plan needs questions and no hops; non-blocked needs empty questions', () => {
    expect(issuesOf(planBlocked)).toEqual([]);
    const noQ = clone(planBlocked);
    noQ.questions = [];
    expect(issuesOf(noQ).some((i) => i.includes('blocked verdict requires at least one question'))).toBe(true);

    const leftover = clone(planFail);
    leftover.questions = [{ id: 'q', ask: 'a?', because: 'b' }];
    expect(issuesOf(leftover).some((i) => i.includes('non-blocked plans must have empty questions'))).toBe(true);
  });

  test('fail needs a conflict finding; pass cannot carry conflicts or proposals', () => {
    const noConflict = clone(planFail);
    noConflict.findings = noConflict.findings!.filter((f) => f.severity !== 'conflict');
    expect(issuesOf(noConflict).some((i) => i.includes('fail verdict requires at least one finding with severity conflict'))).toBe(true);

    const pass = clone(planFail);
    pass.verdict = 'pass';
    const issues = issuesOf(pass);
    expect(issues).toContain('verdict: pass cannot include conflict findings');
    expect(issues.some((i) => i.includes('pass-with-new-work'))).toBe(true);
  });

  test('used nodes and every hop need a status', () => {
    const bad = clone(planFail);
    delete bad.infra[0].status;
    delete bad.hops[0].status;
    const issues = issuesOf(bad);
    expect(issues).toContain('infra[0].status: plan mode requires status on used nodes and hops');
    expect(issues).toContain('hops[0].status: plan mode requires status on used nodes and hops');
  });
});

describe('pr mode', () => {
  test('blocked PR map: no hops, open questions, no compare needed', () => {
    expect(issuesOf(prBlocked)).toEqual([]);
  });

  test('traced PR map needs compare, pr statuses, and beforeWork only on changed', () => {
    const noCompare = clone(pr) as unknown as Record<string, unknown>;
    delete noCompare.compare;
    expect(issuesOf(noCompare)).toContain('compare: pr mode requires compare.base and compare.head');

    const planStatus = clone(pr);
    planStatus.hops[0].status = 'existing';
    expect(issuesOf(planStatus).some((i) => i.startsWith('hops[0].status: pr hops require status'))).toBe(true);

    const changed = clone(pr);
    const idx = changed.hops.findIndex((h) => h.status === 'changed');
    delete changed.hops[idx].beforeWork;
    expect(issuesOf(changed)).toContain(`hops[${idx}].beforeWork: changed hops require beforeWork from the base ref`);

    const stray = clone(pr);
    stray.hops[0].beforeWork = 'was different';
    expect(issuesOf(stray)).toContain('hops[0].beforeWork: only changed hops may include beforeWork');
  });

  test('a PR map has no verdict', () => {
    const bad = clone(pr) as unknown as Record<string, unknown>;
    bad.verdict = 'pass';
    expect(issuesOf(bad).some((i) => i.startsWith('verdict: pr mode has no verdict'))).toBe(true);
  });

  test('the outbox PR golden has one changed, one added, one removed hop', () => {
    const by = (s: string) => pr.hops.filter((h) => h.status === s);
    expect(by('changed')).toHaveLength(1);
    expect(by('added')).toHaveLength(1);
    expect(by('removed')).toHaveLength(1);
    expect(by('changed')[0].beforeWork).toBeTruthy();
    expect(by('removed')[0].n).toBe(pr.hops.length);
  });
});
