/**
 * Architecture-map JSON contract. The HTML shell renders this and only this.
 * Agents fill a MapDocument; they never author HTML/CSS.
 *
 * Four modes share one document shape:
 *   repo  — the whole repository surface, no path (hops must be empty)
 *   flow  — one traced path through the code (1..MAX_HOPS hops)
 *   plan  — an unimplemented plan graded against disk (verdict + findings)
 *   pr    — one path as before/after of a pull request (compare + statuses)
 */

export const SCHEMA_VERSION = 1;

/**
 * Closed vocabulary for how one node touches the next. Generic on purpose:
 * name the mechanism, not the vendor. `label` carries the specifics
 * ("POST /orders", "orders.created topic", "SELECT from orders").
 */
export const TOUCH_TYPES = [
  'HTTP',
  'gRPC',
  'GraphQL',
  'WebSocket',
  'SSE',
  'webhook',
  'message bus',
  'cron',
  'workflow',
  'database',
  'cache',
  'object store',
  'secrets',
  'authz',
  'import',
  'spawn',
  'UNKNOWN',
] as const;

export type TouchType = (typeof TOUCH_TYPES)[number];

/**
 * How a code unit is laid out on disk.
 *   layered — domain / application / infrastructure style boundaries
 *   routes  — file-based routing (src/routes, app/, pages/)
 *   library — shared code with no runtime entry of its own
 *   unknown — nothing recognisable; say so rather than invent
 */
export const COLUMN_KINDS = ['layered', 'routes', 'library', 'unknown'] as const;
export type ColumnKind = (typeof COLUMN_KINDS)[number];

export const QUERY_MODES = ['repo', 'flow', 'plan', 'pr'] as const;
export type QueryMode = (typeof QUERY_MODES)[number];

export const PLAN_STATUSES = ['existing', 'proposed', 'conflict'] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const PR_STATUSES = ['unchanged', 'added', 'removed', 'changed'] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const HOP_STATUSES = [...PLAN_STATUSES, ...PR_STATUSES] as const;
export type HopStatus = (typeof HOP_STATUSES)[number];

export const PLAN_VERDICTS = [
  'pass',
  'pass-with-new-work',
  'fail',
  'blocked',
] as const;
export type PlanVerdict = (typeof PLAN_VERDICTS)[number];

export const FINDING_SEVERITIES = ['conflict', 'proposed', 'info'] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

/** One path is at most this many hops. Split longer flows into two maps. */
export const MAX_HOPS = 12;
/** A layer lists at most this many representative files. */
export const MAX_LAYER_FILES = 6;
/** Hop clauses `in` / `work` / `out` / `fail`, from the opened `source`. */
export const MAX_CLAUSE = 280;
/** Hop reasoning `because` / `not` / `beforeWork`. Omit rather than guess. */
export const MAX_REASON = 280;

export interface MapQuery {
  mode: QueryMode;
  name: string;
}

/** PR mode: git refs the two traces were taken from. */
export interface MapCompare {
  base: string;
  head: string;
  pr?: string;
}

export interface MapNodeUse {
  id: string;
  used: boolean;
  label?: string;
  /** Required on used nodes when query.mode is plan. */
  status?: PlanStatus;
}

export interface MapLayer {
  id: string;
  label: string;
  used: boolean;
  files: string[];
  status?: PlanStatus;
}

export interface MapColumn {
  id: string;
  kind: ColumnKind;
  used: boolean;
  label?: string;
  layers: MapLayer[];
  status?: PlanStatus;
}

export interface MapHop {
  n: number;
  from: string;
  to: string;
  type: TouchType;
  label: string;
  /** Repo-relative path of the file that proves this hop. */
  source: string;
  /** What arrives at this step, from the opened `source`. Omit if silent. */
  in?: string;
  /**
   * What this step does, in plain language. Required. Grounded in `source`.
   * No unexplained function or schema names.
   */
  work: string;
  /** What the next hop receives. Omit if the file is silent. */
  out?: string;
  /** Failure this file names. Omit if silent. Never invent a status. */
  fail?: string;
  /** Why this hop exists, from the opened `source`. Omit when it does not say. */
  because?: string;
  /** Why not the adjacent alternative. Same grounding rule as `because`. */
  not?: string;
  /**
   * Plan: existing / proposed / conflict.
   * PR: unchanged / added / removed / changed.
   * Required on every hop when mode is plan or pr (unless blocked).
   */
  status?: HopStatus;
  /** PR `changed` only: what this step did on the base ref. */
  beforeWork?: string;
}

export interface MapQuestion {
  id: string;
  ask: string;
  because: string;
}

export interface MapFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  nodeId?: string;
  hop?: number;
}

export interface MapGrounding {
  id: string;
  path: string;
}

export interface MapDocument {
  schemaVersion: typeof SCHEMA_VERSION;
  title: string;
  intent: string;
  query: MapQuery;
  generatedAt: string;
  infra: MapNodeUse[];
  processes: MapNodeUse[];
  columns: MapColumn[];
  hops: MapHop[];
  grounding: MapGrounding[];
  unknown: string[];
  /** Plan mode only. */
  verdict?: PlanVerdict;
  /** Plan and PR modes. */
  questions?: MapQuestion[];
  findings?: MapFinding[];
  /** PR mode: base vs head refs. Required unless the PR map is blocked. */
  compare?: MapCompare;
}

export interface MapValidationIssue {
  path: string;
  message: string;
}

const TOUCH_SET = new Set<string>(TOUCH_TYPES);
const KIND_SET = new Set<string>(COLUMN_KINDS);
const MODE_SET = new Set<string>(QUERY_MODES);
const STATUS_SET = new Set<string>(PLAN_STATUSES);
const HOP_STATUS_SET = new Set<string>(HOP_STATUSES);
const PR_STATUS_SET = new Set<string>(PR_STATUSES);
const VERDICT_SET = new Set<string>(PLAN_VERDICTS);
const SEVERITY_SET = new Set<string>(FINDING_SEVERITIES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function modeOf(raw: Record<string, unknown>): string | undefined {
  return isRecord(raw.query) ? asString(raw.query.mode) : undefined;
}

function requireWork(
  hop: Record<string, unknown>,
  path: string,
  issues: MapValidationIssue[]
): void {
  const value = hop.work;
  if (typeof value !== 'string' || !value.trim()) {
    issues.push({
      path,
      message:
        'required: what this step does, in plain language, from the opened source file (in/out/fail are separate clauses)',
    });
    return;
  }
  if (value.length > MAX_CLAUSE) {
    issues.push({ path, message: `must be ≤ ${MAX_CLAUSE} characters` });
  }
}

function optionalText(
  hop: Record<string, unknown>,
  field: 'in' | 'out' | 'fail' | 'because' | 'not' | 'beforeWork',
  max: number,
  path: string,
  issues: MapValidationIssue[]
): void {
  if (!(field in hop)) return;
  const value = hop[field];
  if (typeof value !== 'string') {
    issues.push({ path, message: 'must be a string when present' });
    return;
  }
  if (!value.trim()) {
    issues.push({ path, message: 'omit the field instead of an empty string' });
    return;
  }
  if (value.length > max) {
    issues.push({ path, message: `must be ≤ ${max} characters` });
  }
}

function validateQuestions(
  raw: Record<string, unknown>,
  mode: string,
  issues: MapValidationIssue[]
): number {
  if (!Array.isArray(raw.questions)) {
    issues.push({
      path: 'questions',
      message: `${mode} mode requires questions array (empty if nothing to ask)`,
    });
    return 0;
  }
  raw.questions.forEach((q, i) => {
    if (
      !isRecord(q) ||
      !asString(q.id)?.trim() ||
      !asString(q.ask)?.trim() ||
      !asString(q.because)?.trim()
    ) {
      issues.push({
        path: `questions[${i}]`,
        message: 'each question needs id, ask, and because',
      });
    }
  });
  return raw.questions.length;
}

function validateFindings(
  raw: Record<string, unknown>,
  mode: string,
  issues: MapValidationIssue[]
): Record<string, unknown>[] {
  if (!Array.isArray(raw.findings)) {
    issues.push({
      path: 'findings',
      message: `${mode} mode requires findings array (empty if none)`,
    });
    return [];
  }
  const out: Record<string, unknown>[] = [];
  raw.findings.forEach((f, i) => {
    if (!isRecord(f)) {
      issues.push({ path: `findings[${i}]`, message: 'must be an object' });
      return;
    }
    out.push(f);
    if (!asString(f.id)?.trim() || !asString(f.title)?.trim()) {
      issues.push({ path: `findings[${i}]`, message: 'id and title required' });
    }
    if (!asString(f.detail)?.trim()) {
      issues.push({ path: `findings[${i}].detail`, message: 'required' });
    }
    if (!SEVERITY_SET.has(String(f.severity))) {
      issues.push({
        path: `findings[${i}].severity`,
        message: `must be one of ${FINDING_SEVERITIES.join(', ')}`,
      });
    }
  });
  return out;
}

function collectNode(
  node: unknown,
  path: string,
  nodeIds: Set<string>,
  issues: MapValidationIssue[]
): void {
  if (!isRecord(node)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  const id = asString(node.id);
  if (!id?.trim()) {
    issues.push({ path: `${path}.id`, message: 'required' });
    return;
  }
  if (nodeIds.has(id)) {
    issues.push({ path: `${path}.id`, message: `duplicate id "${id}"` });
  } else {
    nodeIds.add(id);
  }
  if (asBoolean(node.used) === undefined) {
    issues.push({ path: `${path}.used`, message: 'required boolean' });
  }
  if (node.status !== undefined && !STATUS_SET.has(String(node.status))) {
    issues.push({
      path: `${path}.status`,
      message: `must be one of ${PLAN_STATUSES.join(', ')}`,
    });
  }
}

function validateColumns(
  raw: Record<string, unknown>,
  nodeIds: Set<string>,
  issues: MapValidationIssue[]
): void {
  const columns = Array.isArray(raw.columns) ? raw.columns : null;
  if (!columns) {
    issues.push({ path: 'columns', message: 'required array' });
    return;
  }
  columns.forEach((col, i) => {
    if (!isRecord(col)) {
      issues.push({ path: `columns[${i}]`, message: 'must be an object' });
      return;
    }
    const id = asString(col.id);
    if (!id?.trim()) {
      issues.push({ path: `columns[${i}].id`, message: 'required' });
    } else if (nodeIds.has(id)) {
      issues.push({ path: `columns[${i}].id`, message: `duplicate id "${id}"` });
    } else {
      nodeIds.add(id);
    }
    if (!KIND_SET.has(String(col.kind))) {
      issues.push({
        path: `columns[${i}].kind`,
        message: `must be one of ${COLUMN_KINDS.join(', ')}`,
      });
    }
    if (asBoolean(col.used) === undefined) {
      issues.push({ path: `columns[${i}].used`, message: 'required boolean' });
    }
    if (col.status !== undefined && !STATUS_SET.has(String(col.status))) {
      issues.push({
        path: `columns[${i}].status`,
        message: `must be one of ${PLAN_STATUSES.join(', ')}`,
      });
    }
    const layers = Array.isArray(col.layers) ? col.layers : null;
    if (!layers) {
      issues.push({ path: `columns[${i}].layers`, message: 'required array' });
      return;
    }
    layers.forEach((layer, j) => {
      const p = `columns[${i}].layers[${j}]`;
      if (!isRecord(layer)) {
        issues.push({ path: p, message: 'must be an object' });
        return;
      }
      const layerId = asString(layer.id);
      if (!layerId?.trim()) {
        issues.push({ path: `${p}.id`, message: 'required' });
      } else if (nodeIds.has(layerId)) {
        issues.push({ path: `${p}.id`, message: `duplicate id "${layerId}"` });
      } else {
        nodeIds.add(layerId);
      }
      if (!asString(layer.label)?.trim()) {
        issues.push({ path: `${p}.label`, message: 'required' });
      }
      if (asBoolean(layer.used) === undefined) {
        issues.push({ path: `${p}.used`, message: 'required boolean' });
      }
      if (!Array.isArray(layer.files)) {
        issues.push({ path: `${p}.files`, message: 'required array' });
      } else {
        if (layer.files.length > MAX_LAYER_FILES) {
          issues.push({
            path: `${p}.files`,
            message: `list at most ${MAX_LAYER_FILES} representative files`,
          });
        }
        layer.files.forEach((f, k) => {
          if (typeof f !== 'string' || !f.trim()) {
            issues.push({ path: `${p}.files[${k}]`, message: 'must be a path' });
          }
        });
      }
      if (layer.status !== undefined && !STATUS_SET.has(String(layer.status))) {
        issues.push({
          path: `${p}.status`,
          message: `must be one of ${PLAN_STATUSES.join(', ')}`,
        });
      }
    });
  });
}

function validateHops(
  raw: Record<string, unknown>,
  nodeIds: Set<string>,
  issues: MapValidationIssue[]
): Record<string, unknown>[] {
  const hops = Array.isArray(raw.hops) ? raw.hops : null;
  if (!hops) {
    issues.push({ path: 'hops', message: 'required array' });
    return [];
  }
  const mode = modeOf(raw);
  const questionCount = Array.isArray(raw.questions) ? raw.questions.length : 0;

  if (mode === 'repo' && hops.length > 0) {
    issues.push({
      path: 'hops',
      message:
        'repo mode is the surface only — hops must be empty; use flow mode to trace a path',
    });
  }
  if (hops.length === 0 && mode !== 'repo') {
    const planBlocked = mode === 'plan' && raw.verdict === 'blocked';
    const prBlocked = mode === 'pr' && questionCount > 0;
    if (!planBlocked && !prBlocked) {
      issues.push({
        path: 'hops',
        message:
          'at least one hop required (only a blocked plan or a PR map with open questions may have none)',
      });
    }
  }
  if (hops.length > MAX_HOPS) {
    issues.push({
      path: 'hops',
      message: `at most ${MAX_HOPS} hops; split the flow into two maps`,
    });
  }

  const out: Record<string, unknown>[] = [];
  hops.forEach((hop, i) => {
    if (!isRecord(hop)) {
      issues.push({ path: `hops[${i}]`, message: 'must be an object' });
      return;
    }
    out.push(hop);
    if (hop.n !== i + 1) {
      issues.push({
        path: `hops[${i}].n`,
        message: `must be ${i + 1} (1-based, contiguous)`,
      });
    }
    const from = asString(hop.from);
    const to = asString(hop.to);
    if (!from) issues.push({ path: `hops[${i}].from`, message: 'required' });
    else if (!nodeIds.has(from)) {
      issues.push({ path: `hops[${i}].from`, message: `unknown node "${from}"` });
    }
    if (!to) issues.push({ path: `hops[${i}].to`, message: 'required' });
    else if (!nodeIds.has(to)) {
      issues.push({ path: `hops[${i}].to`, message: `unknown node "${to}"` });
    }
    if (!TOUCH_SET.has(String(hop.type))) {
      issues.push({
        path: `hops[${i}].type`,
        message: `must be one of ${TOUCH_TYPES.join(', ')}`,
      });
    }
    if (!asString(hop.label)?.trim()) {
      issues.push({ path: `hops[${i}].label`, message: 'required' });
    }
    if (!asString(hop.source)?.trim()) {
      issues.push({
        path: `hops[${i}].source`,
        message: 'required file path grounding this hop',
      });
    }
    requireWork(hop, `hops[${i}].work`, issues);
    optionalText(hop, 'in', MAX_CLAUSE, `hops[${i}].in`, issues);
    optionalText(hop, 'out', MAX_CLAUSE, `hops[${i}].out`, issues);
    optionalText(hop, 'fail', MAX_CLAUSE, `hops[${i}].fail`, issues);
    optionalText(hop, 'because', MAX_REASON, `hops[${i}].because`, issues);
    optionalText(hop, 'not', MAX_REASON, `hops[${i}].not`, issues);
    optionalText(hop, 'beforeWork', MAX_REASON, `hops[${i}].beforeWork`, issues);
    if (hop.status !== undefined && !HOP_STATUS_SET.has(String(hop.status))) {
      issues.push({
        path: `hops[${i}].status`,
        message: `must be one of ${HOP_STATUSES.join(', ')}`,
      });
    }
    if (mode === 'flow' && hop.status !== undefined) {
      issues.push({
        path: `hops[${i}].status`,
        message: 'flow hops carry no status; status belongs to plan and pr modes',
      });
    }
  });
  return out;
}

function requireStatus(
  value: unknown,
  path: string,
  issues: MapValidationIssue[]
): void {
  if (value === undefined) {
    issues.push({
      path,
      message: 'plan mode requires status on used nodes and hops',
    });
    return;
  }
  if (!STATUS_SET.has(String(value))) {
    issues.push({
      path,
      message: `must be one of ${PLAN_STATUSES.join(', ')}`,
    });
  }
}

function validatePlanContract(
  raw: Record<string, unknown>,
  hops: Record<string, unknown>[],
  issues: MapValidationIssue[]
): void {
  if (modeOf(raw) !== 'plan') return;

  if (!VERDICT_SET.has(String(raw.verdict))) {
    issues.push({
      path: 'verdict',
      message: `plan mode requires verdict: ${PLAN_VERDICTS.join(', ')}`,
    });
  }
  const questionCount = validateQuestions(raw, 'plan', issues);
  const findings = validateFindings(raw, 'plan', issues);
  const blocked = raw.verdict === 'blocked';
  const hasConflict = findings.some((f) => f.severity === 'conflict');

  if (blocked) {
    if (questionCount < 1) {
      issues.push({
        path: 'questions',
        message:
          'blocked verdict requires at least one question — ask, do not guess',
      });
    }
    return;
  }
  if (questionCount > 0) {
    issues.push({
      path: 'questions',
      message: 'non-blocked plans must have empty questions; ask first, then emit',
    });
  }
  if (raw.verdict === 'fail' && !hasConflict) {
    issues.push({
      path: 'findings',
      message: 'fail verdict requires at least one finding with severity conflict',
    });
  }
  if ((raw.verdict === 'pass' || raw.verdict === 'pass-with-new-work') && hasConflict) {
    issues.push({
      path: 'verdict',
      message: `${String(raw.verdict)} cannot include conflict findings`,
    });
  }
  if (raw.verdict === 'pass') {
    const proposed = findings.some((f) => f.severity === 'proposed');
    const proposedNode =
      collectStatuses(raw).some((s) => s === 'proposed') ||
      hops.some((h) => h.status === 'proposed');
    if (proposed || proposedNode) {
      issues.push({
        path: 'verdict',
        message:
          'pass means nothing new; a plan with proposed nodes, hops, or findings is pass-with-new-work',
      });
    }
  }

  (Array.isArray(raw.infra) ? raw.infra : []).forEach((n, i) => {
    if (isRecord(n) && n.used === true) {
      requireStatus(n.status, `infra[${i}].status`, issues);
    }
  });
  (Array.isArray(raw.processes) ? raw.processes : []).forEach((n, i) => {
    if (isRecord(n) && n.used === true) {
      requireStatus(n.status, `processes[${i}].status`, issues);
    }
  });
  (Array.isArray(raw.columns) ? raw.columns : []).forEach((c, i) => {
    if (!isRecord(c)) return;
    if (c.used === true) requireStatus(c.status, `columns[${i}].status`, issues);
    (Array.isArray(c.layers) ? c.layers : []).forEach((layer, j) => {
      if (isRecord(layer) && layer.used === true) {
        requireStatus(layer.status, `columns[${i}].layers[${j}].status`, issues);
      }
    });
  });
  hops.forEach((hop, i) => requireStatus(hop.status, `hops[${i}].status`, issues));
}

function collectStatuses(raw: Record<string, unknown>): unknown[] {
  const out: unknown[] = [];
  const push = (n: unknown) => {
    if (isRecord(n) && n.used === true) out.push(n.status);
  };
  (Array.isArray(raw.infra) ? raw.infra : []).forEach(push);
  (Array.isArray(raw.processes) ? raw.processes : []).forEach(push);
  (Array.isArray(raw.columns) ? raw.columns : []).forEach((c) => {
    push(c);
    if (isRecord(c) && Array.isArray(c.layers)) c.layers.forEach(push);
  });
  return out;
}

function validatePrContract(
  raw: Record<string, unknown>,
  hops: Record<string, unknown>[],
  issues: MapValidationIssue[]
): void {
  if (modeOf(raw) !== 'pr') return;

  const questionCount = validateQuestions(raw, 'pr', issues);
  validateFindings(raw, 'pr', issues);
  if ('verdict' in raw) {
    issues.push({
      path: 'verdict',
      message: 'pr mode has no verdict; a PR map describes, it does not grade',
    });
  }

  const blocked = hops.length === 0 && questionCount > 0;
  if (blocked) return;

  if (questionCount > 0) {
    issues.push({
      path: 'questions',
      message: 'a traced PR map must have empty questions; ask first, then emit',
    });
  }
  if (!isRecord(raw.compare)) {
    issues.push({
      path: 'compare',
      message: 'pr mode requires compare.base and compare.head',
    });
  } else {
    if (!asString(raw.compare.base)?.trim()) {
      issues.push({ path: 'compare.base', message: 'required git ref' });
    }
    if (!asString(raw.compare.head)?.trim()) {
      issues.push({ path: 'compare.head', message: 'required git ref' });
    }
  }
  hops.forEach((hop, i) => {
    if (!PR_STATUS_SET.has(String(hop.status))) {
      issues.push({
        path: `hops[${i}].status`,
        message: `pr hops require status: ${PR_STATUSES.join(', ')}`,
      });
    }
    if (hop.status === 'changed') {
      if (typeof hop.beforeWork !== 'string' || !hop.beforeWork.trim()) {
        issues.push({
          path: `hops[${i}].beforeWork`,
          message: 'changed hops require beforeWork from the base ref',
        });
      }
    } else if ('beforeWork' in hop) {
      issues.push({
        path: `hops[${i}].beforeWork`,
        message: 'only changed hops may include beforeWork',
      });
    }
  });
}

function validateModeOnlyFields(
  raw: Record<string, unknown>,
  issues: MapValidationIssue[]
): void {
  const mode = modeOf(raw);
  if (mode === 'repo' || mode === 'flow') {
    for (const field of ['verdict', 'compare'] as const) {
      if (field in raw) {
        issues.push({
          path: field,
          message: `${field} belongs to ${field === 'verdict' ? 'plan' : 'pr'} mode only`,
        });
      }
    }
    if (Array.isArray(raw.questions) && raw.questions.length > 0) {
      issues.push({
        path: 'questions',
        message: `${mode} maps do not carry questions; ask in chat before emitting`,
      });
    }
    // Optional in repo/flow (inventory notes, dead services); shape still checked.
    if ('findings' in raw) validateFindings(raw, mode, issues);
  }
}

export function validateMapDocument(raw: unknown): MapValidationIssue[] {
  const issues: MapValidationIssue[] = [];
  if (!isRecord(raw)) {
    return [{ path: '$', message: 'map must be an object' }];
  }

  if (raw.schemaVersion !== SCHEMA_VERSION) {
    issues.push({
      path: 'schemaVersion',
      message: `required: ${SCHEMA_VERSION}`,
    });
  }
  if (!asString(raw.title)?.trim()) {
    issues.push({ path: 'title', message: 'required non-empty string' });
  }
  if (!asString(raw.intent)?.trim()) {
    issues.push({ path: 'intent', message: 'required non-empty string' });
  }
  if (!isRecord(raw.query)) {
    issues.push({ path: 'query', message: 'required object' });
  } else {
    if (!MODE_SET.has(String(raw.query.mode))) {
      issues.push({
        path: 'query.mode',
        message: `must be one of ${QUERY_MODES.join(', ')}`,
      });
    }
    if (!asString(raw.query.name)?.trim()) {
      issues.push({ path: 'query.name', message: 'required non-empty string' });
    }
  }
  if (!asString(raw.generatedAt)?.trim()) {
    issues.push({ path: 'generatedAt', message: 'required non-empty string' });
  }

  const nodeIds = new Set<string>();
  const infra = Array.isArray(raw.infra) ? raw.infra : null;
  if (!infra) issues.push({ path: 'infra', message: 'required array' });
  else infra.forEach((n, i) => collectNode(n, `infra[${i}]`, nodeIds, issues));

  const processes = Array.isArray(raw.processes) ? raw.processes : null;
  if (!processes) issues.push({ path: 'processes', message: 'required array' });
  else {
    processes.forEach((n, i) =>
      collectNode(n, `processes[${i}]`, nodeIds, issues)
    );
  }

  validateColumns(raw, nodeIds, issues);
  const hops = validateHops(raw, nodeIds, issues);

  if (!Array.isArray(raw.grounding)) {
    issues.push({ path: 'grounding', message: 'required array' });
  } else {
    raw.grounding.forEach((row, i) => {
      if (!isRecord(row) || !asString(row.id) || !asString(row.path)) {
        issues.push({
          path: `grounding[${i}]`,
          message: 'each entry needs id and path',
        });
      }
    });
  }
  if (!Array.isArray(raw.unknown)) {
    issues.push({ path: 'unknown', message: 'required array (may be empty)' });
  }

  validateModeOnlyFields(raw, issues);
  validatePlanContract(raw, hops, issues);
  validatePrContract(raw, hops, issues);
  return issues;
}

export function parseMapDocument(raw: unknown): MapDocument {
  const issues = validateMapDocument(raw);
  if (issues.length > 0) {
    const detail = issues.map((i) => `${i.path}: ${i.message}`).join('\n');
    throw new Error(`Invalid architecture map:\n${detail}`);
  }
  return raw as MapDocument;
}

/** Every node id a hop may reference, in document order. */
export function nodeIdsOf(map: MapDocument): string[] {
  const ids: string[] = [];
  map.infra.forEach((n) => ids.push(n.id));
  map.processes.forEach((n) => ids.push(n.id));
  map.columns.forEach((c) => {
    ids.push(c.id);
    c.layers.forEach((l) => ids.push(l.id));
  });
  return ids;
}
