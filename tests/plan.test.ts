import { describe, expect, test } from 'bun:test';

import { buildInventory } from '../plugins/architecture-map/skills/architecture-map/runtime/inventory';
import {
  inventoryAllowsStatus,
  mechanicalPlanIssues,
  membershipOf,
} from '../plugins/architecture-map/skills/architecture-map/runtime/modes/plan';
import type { MapDocument } from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { SAMPLE_REPO, clone, loadFixture } from './helpers';

const inv = buildInventory(SAMPLE_REPO);
const planFail = (await loadFixture('plan-fail-orders-cache-cron.map.json')) as MapDocument;
const planBlocked = (await loadFixture('plan-blocked-missing-entry.map.json')) as MapDocument;
const flow = (await loadFixture('flow-create-order.map.json')) as MapDocument;

describe('membershipOf', () => {
  test('compose services resolve to their band, by id or container name', () => {
    expect(membershipOf(inv, 'postgres').kind).toBe('infra');
    expect(membershipOf(inv, 'shop-postgres')).toEqual({ kind: 'infra', id: 'postgres' });
    expect(membershipOf(inv, 'api').kind).toBe('process');
  });

  test('units, features, and existing layers resolve; missing layers are absent', () => {
    expect(membershipOf(inv, 'shared')).toEqual({ kind: 'unit', id: 'shared' });
    expect(membershipOf(inv, 'apps/web')).toEqual({ kind: 'unit', id: 'web' });
    expect(membershipOf(inv, 'api/orders')).toEqual({ kind: 'feature', id: 'api/orders' });
    expect(membershipOf(inv, 'api/orders/infrastructure')).toEqual({ kind: 'feature', id: 'api/orders' });
    expect(membershipOf(inv, 'api/orders/cache')).toEqual({ kind: 'absent', id: 'api/orders/cache' });
    expect(membershipOf(inv, 'api/billing/domain').kind).toBe('absent');
  });

  test('directories under a unit resolve two levels deep; unknown paths are absent', () => {
    expect(membershipOf(inv, 'web/src')).toEqual({ kind: 'unit', id: 'web' });
    expect(membershipOf(inv, 'web/src/routes')).toEqual({ kind: 'unit', id: 'web' });
    expect(membershipOf(inv, 'web/src/routes/orders/new')).toEqual({ kind: 'unit', id: 'web' });
    expect(membershipOf(inv, 'web/workers').kind).toBe('absent');
    expect(membershipOf(inv, 'reports').kind).toBe('absent');
    expect(membershipOf(inv, 'reports/nightly/job').kind).toBe('absent');
  });
});

describe('inventoryAllowsStatus', () => {
  test('existing needs presence, proposed needs absence, unused nodes are ignored', () => {
    expect(inventoryAllowsStatus({ kind: 'absent', id: 'x' }, 'existing', true)).toMatch(/inventory has no "x"/);
    expect(inventoryAllowsStatus({ kind: 'unit', id: 'api' }, 'proposed', true)).toMatch(/already exists on disk as unit/);
    expect(inventoryAllowsStatus({ kind: 'absent', id: 'x' }, 'proposed', true)).toBeNull();
    expect(inventoryAllowsStatus({ kind: 'infra', id: 'redis' }, 'existing', true)).toBeNull();
    expect(inventoryAllowsStatus({ kind: 'absent', id: 'x' }, 'existing', false)).toBeNull();
    expect(inventoryAllowsStatus({ kind: 'absent', id: 'x' }, undefined, true)).toBeNull();
  });
});

describe('mechanicalPlanIssues', () => {
  test('the fail golden is consistent with the sample repo', () => {
    expect(mechanicalPlanIssues(planFail, inv)).toEqual([]);
  });

  test('blocked plans and non-plan maps are skipped', () => {
    expect(mechanicalPlanIssues(planBlocked, inv)).toEqual([]);
    expect(mechanicalPlanIssues(flow, inv)).toEqual([]);
  });

  test('claiming existing for something not on disk is flagged', () => {
    const bad = clone(planFail);
    bad.processes.find((p) => p.id === 'reports')!.status = 'existing';
    const issues = mechanicalPlanIssues(bad, inv);
    expect(issues.some((i) => i.path.startsWith('processes[') && /inventory has no "reports"/.test(i.message))).toBe(true);
  });

  test('claiming proposed for something already on disk is flagged', () => {
    const bad = clone(planFail);
    bad.infra.find((n) => n.id === 'redis')!.status = 'proposed';
    const issues = mechanicalPlanIssues(bad, inv);
    expect(issues.some((i) => /"redis" already exists on disk as infra/.test(i.message))).toBe(true);
  });

  test('host ports in labels are rejected', () => {
    const bad = clone(planFail);
    bad.hops[0].label = 'INSERT via localhost:15432';
    expect(mechanicalPlanIssues(bad, inv).some((i) => i.path === 'hops[0].label')).toBe(true);
  });

  test('an existing hop cannot touch a proposed node', () => {
    const bad = clone(planFail);
    bad.hops[1].status = 'existing';
    const issues = mechanicalPlanIssues(bad, inv);
    expect(issues.some((i) => i.path === 'hops[1].status' && /proposed node "api\/orders\/cache"/.test(i.message))).toBe(true);
  });

  test('a conflict hop needs a conflict finding that names it', () => {
    const bad = clone(planFail);
    bad.findings = bad.findings!.map((f) => (f.severity === 'conflict' ? { ...f, hop: 1 } : f));
    const issues = mechanicalPlanIssues(bad, inv);
    expect(issues.some((i) => i.path === 'hops[4].status' && /conflict finding/.test(i.message))).toBe(true);
  });
});
