/**
 * Mechanical plan-vs-inventory checks.
 *
 * Agents still write the findings; this only flags statuses that cannot be
 * true given what is on disk, plus a few shape rules that hold for any repo.
 * Nothing here knows a service or framework by name.
 */

import type { Inventory } from './inventory';
import type { MapDocument, MapValidationIssue, PlanStatus } from './schema';

export type MembershipKind =
  | 'infra'
  | 'process'
  | 'unit'
  | 'feature'
  | 'absent';

export interface Membership {
  kind: MembershipKind;
  /** The inventory id that matched (may be a prefix of the node id). */
  id: string;
}

/**
 * Where does a map node id live in the inventory?
 *
 *   `<compose-service>`            → infra | process
 *   `<unit>`                       → unit
 *   `<unit>/<feature>`             → feature
 *   `<unit>/<feature>/<layer>`     → feature when that layer directory exists,
 *                                    absent when it does not (a proposed layer)
 *   `<unit>/<dir>[/<dir>]…`        → unit when the directory exists under the
 *                                    unit (two levels recorded), else absent
 *   otherwise                      → absent
 *
 * Node ids therefore mirror disk: `api/orders/infrastructure` is the
 * `infrastructure/` directory of the `orders` feature in the `api` unit.
 */
export function membershipOf(inv: Inventory, id: string): Membership {
  const compose = inv.compose.find(
    (s) => s.id === id || s.containerName === id
  );
  if (compose) return { kind: compose.band, id: compose.id };

  const unit = inv.units.find((u) => u.id === id || u.path === id);
  if (unit) return { kind: 'unit', id: unit.id };

  const exactFeature = inv.features.find(
    (f) => `${f.unit}/${f.name}` === id || f.path === id
  );
  if (exactFeature) {
    return { kind: 'feature', id: `${exactFeature.unit}/${exactFeature.name}` };
  }

  const [head, ...rest] = id.split('/');
  if (rest.length === 0) return { kind: 'absent', id };
  const owner = inv.units.find((u) => u.id === head);
  if (!owner) return { kind: 'absent', id };

  const feature = inv.features.find((f) => f.unit === head && f.name === rest[0]);
  if (feature) {
    const featureId = `${feature.unit}/${feature.name}`;
    if (rest.length === 1) return { kind: 'feature', id: featureId };
    const dirs = feature.dirs || [];
    return dirs.includes(rest[1])
      ? { kind: 'feature', id: featureId }
      : { kind: 'absent', id };
  }

  const relPath = rest.join('/');
  const dirs = owner.dirs || [];
  const known = dirs.some((d) => relPath === d || relPath.startsWith(`${d}/`));
  return known ? { kind: 'unit', id: owner.id } : { kind: 'absent', id };
}

/** Message when the inventory contradicts a status; `null` when consistent. */
export function inventoryAllowsStatus(
  membership: Membership,
  status: PlanStatus | undefined,
  used: boolean
): string | null {
  if (!used || !status) return null;
  if (status === 'existing' && membership.kind === 'absent') {
    return `status existing but the inventory has no "${membership.id}" — either it is proposed, or the id does not match disk`;
  }
  if (status === 'proposed' && membership.kind !== 'absent') {
    return `status proposed but "${membership.id}" already exists on disk as ${membership.kind}`;
  }
  return null;
}

const LOCALHOST_PORT = /\blocalhost:\d{2,5}\b|\b127\.0\.0\.1:\d{2,5}\b/;

export function mechanicalPlanIssues(
  map: MapDocument,
  inv: Inventory
): MapValidationIssue[] {
  if (map.query.mode !== 'plan') return [];
  if (map.verdict === 'blocked') return [];

  const issues: MapValidationIssue[] = [];
  const statusOf = new Map<string, PlanStatus | undefined>();

  const checkNode = (
    node: { id: string; used: boolean; status?: PlanStatus },
    path: string
  ) => {
    statusOf.set(node.id, node.status);
    const msg = inventoryAllowsStatus(
      membershipOf(inv, node.id),
      node.status,
      node.used
    );
    if (msg) issues.push({ path, message: msg });
  };

  map.infra.forEach((n, i) => checkNode(n, `infra[${i}].status`));
  map.processes.forEach((n, i) => checkNode(n, `processes[${i}].status`));
  map.columns.forEach((c, i) => {
    checkNode(c, `columns[${i}].status`);
    c.layers.forEach((layer, j) =>
      checkNode(layer, `columns[${i}].layers[${j}].status`)
    );
  });

  map.hops.forEach((hop, i) => {
    if (LOCALHOST_PORT.test(hop.label)) {
      issues.push({
        path: `hops[${i}].label`,
        message:
          'diagrams name the service, not a host port; use the compose service id or the process name',
      });
    }
    if (hop.status === 'existing') {
      for (const end of [hop.from, hop.to]) {
        if (statusOf.get(end) === 'proposed') {
          issues.push({
            path: `hops[${i}].status`,
            message: `an existing hop cannot touch proposed node "${end}"; the hop is proposed too`,
          });
        }
      }
    }
    if (hop.status === 'conflict') {
      const explained = (map.findings || []).some(
        (f) => f.severity === 'conflict' && (f.hop === hop.n || !f.hop)
      );
      if (!explained) {
        issues.push({
          path: `hops[${i}].status`,
          message:
            'a conflict hop needs a conflict finding that says what it collides with',
        });
      }
    }
  });

  return issues;
}
