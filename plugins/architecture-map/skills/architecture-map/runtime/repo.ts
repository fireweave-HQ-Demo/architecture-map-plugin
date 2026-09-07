/**
 * Mechanical draft of a `repo` mode map from an inventory.
 *
 * `init` runs this so the repository surface never has to be typed by hand:
 * every infra and process box is a compose service, every column is a
 * directory that exists, every listed file is on disk. The agent may then
 * improve `title` / `intent`, add findings it can ground, and re-render —
 * but it starts from a map the validator already accepts.
 *
 * Nothing here knows a framework or vendor by name.
 */

import { readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import type { ComposeService, FeatureRecord, Inventory, UnitRecord } from './inventory';
import {
  MAX_LAYER_FILES,
  SCHEMA_VERSION,
  type MapColumn,
  type MapDocument,
  type MapFinding,
  type MapGrounding,
  type MapLayer,
  type MapNodeUse,
} from './schema';

export interface DraftRepoOptions {
  /** Display name; defaults to the root manifest name, then the directory name. */
  name?: string;
  /** ISO timestamp; defaults to now. Tests pass a fixed value. */
  generatedAt?: string;
}

/** Layers drawn per column before the rest is folded into a finding. */
export const MAX_LAYERS_PER_COLUMN = 10;

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  'vendor',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__',
]);

const FEATURE_CONTAINERS = new Set(['features', 'modules']);
const SOURCE_ROOTS = ['src', 'lib', 'app', 'internal', 'cmd', 'pkg'];
const TEST_PATH = /(\.(test|spec)\.|__tests__\/|\/tests?\/|\/fixtures?\/|\/__snapshots__\/)/i;
const CODE_FILE = /\.(m?[jt]sx?|py|go|rs|java|kt|rb|php|cs|swift|scala|ex|exs|env|ya?ml|toml|json|sql|sh)$/i;
const MAX_FILES_SCANNED = 5000;
const MAX_FILE_BYTES = 512 * 1024;

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function listDirs(p: string): string[] {
  if (!isDir(p)) return [];
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !IGNORED_DIRS.has(d.name) && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

function rel(root: string, abs: string): string {
  const r = relative(root, abs).split('\\').join('/');
  return r === '' ? '.' : r;
}

/** Files under `dir`, shallow first, tests skipped, capped for the layer. */
function representativeFiles(root: string, dir: string, cap = MAX_LAYER_FILES): string[] {
  const found: Array<{ depth: number; path: string }> = [];
  const walk = (d: string, depth: number) => {
    if (depth > 4 || found.length > cap * 8) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(d, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name) && !e.name.startsWith('.')) walk(abs, depth + 1);
      } else if (e.isFile()) {
        const r = rel(root, abs);
        if (!TEST_PATH.test('/' + r) && !e.name.startsWith('.')) found.push({ depth, path: r });
      }
    }
  };
  walk(dir, 0);
  found.sort((a, b) => a.depth - b.depth || a.path.localeCompare(b.path));
  return found.slice(0, cap).map((f) => f.path);
}

function rootName(root: string): string {
  const manifest = join(root, 'package.json');
  if (isFile(manifest)) {
    try {
      const name = (JSON.parse(readFileSync(manifest, 'utf8')) as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) return name.trim();
    } catch {
      // fall through to the directory name
    }
  }
  return basename(resolve(root));
}

function composeBuildPath(root: string, svc: ComposeService): string | null {
  if (!svc.build) return null;
  const abs = resolve(root, dirname(svc.file), svc.build);
  return rel(root, abs);
}

function unitAbs(root: string, unit: UnitRecord): string {
  return unit.path === '.' ? root : join(root, unit.path);
}

function sourceRoot(abs: string): string {
  for (const s of SOURCE_ROOTS) if (isDir(join(abs, s))) return s;
  return '.';
}

function layersFor(
  root: string,
  columnId: string,
  dirAbs: string,
  overflow: string[]
): MapLayer[] {
  const subdirs = listDirs(dirAbs);
  if (subdirs.length === 0) {
    const files = representativeFiles(root, dirAbs);
    return [{ id: `${columnId}/files`, label: 'files', used: true, files }];
  }
  const drawn = subdirs.slice(0, MAX_LAYERS_PER_COLUMN);
  overflow.push(...subdirs.slice(MAX_LAYERS_PER_COLUMN).map((d) => rel(root, join(dirAbs, d))));
  return drawn.map((d) => ({
    id: `${columnId}/${d}`,
    label: d,
    used: true,
    files: representativeFiles(root, join(dirAbs, d)),
  }));
}

function featureColumn(
  root: string,
  unit: UnitRecord,
  feature: FeatureRecord,
  overflow: string[]
): MapColumn {
  const id = `${unit.id}/${feature.name}`;
  const layered =
    feature.layers.domain || feature.layers.application || feature.layers.infrastructure;
  return {
    id,
    kind: layered ? 'layered' : 'unknown',
    used: true,
    label: `${unit.id} / ${feature.name}`,
    layers: layersFor(root, id, join(root, feature.path), overflow),
  };
}

function supportColumn(
  root: string,
  unit: UnitRecord,
  dirName: string,
  dirAbs: string,
  overflow: string[]
): MapColumn {
  const id = `${unit.id}/${dirName}`;
  return {
    id,
    kind: 'library',
    used: true,
    label: `${unit.id} / ${dirName}`,
    layers: layersFor(root, id, dirAbs, overflow),
  };
}

function wholeUnitColumn(
  root: string,
  unit: UnitRecord,
  overflow: string[]
): MapColumn {
  const abs = unitAbs(root, unit);
  const src = sourceRoot(abs);
  const id = `${unit.id}/${src === '.' ? 'root' : src}`;
  return {
    id,
    kind: unit.layout,
    used: true,
    label: unit.id,
    layers: layersFor(root, id, src === '.' ? abs : join(abs, src), overflow),
  };
}

/**
 * Infra services nothing points at: no process service names them in its
 * compose block (depends_on, links, connection URLs) and no source file
 * mentions them. Cheap word search, enough for an info finding that says
 * "this runs but nothing seems to call it".
 */
function unreferencedInfra(root: string, inv: Inventory): string[] {
  const wired = new Set(inv.compose.flatMap((s) => s.refs));
  const infra = inv.compose.filter((s) => s.band === 'infra' && !wired.has(s.id));
  if (infra.length === 0) return [];
  const composeFiles = new Set(inv.compose.map((s) => join(root, s.file)));
  const pending = new Map<string, RegExp>();
  for (const s of infra) {
    const words = [s.id, s.containerName].filter((w): w is string => !!w);
    pending.set(
      s.id,
      new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'i')
    );
  }
  let scanned = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 8 || scanned > MAX_FILES_SCANNED || pending.size === 0) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (pending.size === 0) return;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name) && e.name !== '.git') walk(abs, depth + 1);
        continue;
      }
      if (!e.isFile() || !CODE_FILE.test(e.name) || composeFiles.has(abs)) continue;
      let text: string;
      try {
        if (statSync(abs).size > MAX_FILE_BYTES) continue;
        text = readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      scanned += 1;
      for (const [id, re] of pending) if (re.test(text)) pending.delete(id);
    }
  };
  walk(root, 0);
  return [...pending.keys()];
}

export function draftRepoMap(inv: Inventory, opts: DraftRepoOptions = {}): MapDocument {
  const root = inv.repoRoot;
  const name = opts.name?.trim() || rootName(root);
  const findings: MapFinding[] = [];
  const overflow: string[] = [];

  const infra: MapNodeUse[] = inv.compose
    .filter((s) => s.band === 'infra')
    .map((s) => ({ id: s.id, used: true, label: s.image ? `${s.id} (${s.image})` : s.id }));

  const composeProcesses = inv.compose.filter((s) => s.band === 'process');
  const processes: MapNodeUse[] = composeProcesses.length
    ? composeProcesses.map((s) => {
        const unit = inv.units.find((u) => u.id === s.unit);
        const where = unit?.path ?? composeBuildPath(root, s);
        return { id: s.id, used: true, label: where ? `${s.id} — ${where}` : s.id };
      })
    : inv.units
        .filter((u) => u.kind === 'app' || (u.kind === 'root' && u.hasDockerfile))
        .map((u) => ({ id: u.id, used: true, label: `${u.id} — ${u.path}` }));

  const columns: MapColumn[] = [];
  for (const unit of inv.units) {
    const features = inv.features.filter((f) => f.unit === unit.id);
    if (features.length === 0) {
      columns.push(wholeUnitColumn(root, unit, overflow));
      continue;
    }
    for (const f of features) columns.push(featureColumn(root, unit, f, overflow));
    const abs = unitAbs(root, unit);
    const src = sourceRoot(abs);
    const srcAbs = src === '.' ? abs : join(abs, src);
    for (const d of listDirs(srcAbs)) {
      if (FEATURE_CONTAINERS.has(d)) continue;
      columns.push(supportColumn(root, unit, d, join(srcAbs, d), overflow));
    }
  }

  // Findings the inventory can stand behind.
  inv.findings.forEach((text, i) => {
    findings.push({
      id: `inventory-${i + 1}`,
      severity: 'info',
      title: text.length > 90 ? text.slice(0, 87).trimEnd() + '…' : text,
      detail: text,
    });
  });
  for (const f of inv.features) {
    const have = (['domain', 'application', 'infrastructure'] as const).filter((l) => f.layers[l]);
    const missing = (['domain', 'application', 'infrastructure'] as const).filter((l) => !f.layers[l]);
    if (have.length > 0 && missing.length > 0) {
      findings.push({
        id: `${f.unit}-${f.name}-layers`,
        severity: 'info',
        title: `${f.name} has ${have.join(' and ')} but no ${missing.join(' or ')} layer`,
        detail: `${f.path} contains ${have.join(', ')}; ${missing.join(', ')} ${
          missing.length === 1 ? 'is' : 'are'
        } not on disk. That may be intended — this is the shape, not a grade.`,
        nodeId: `${f.unit}/${f.name}`,
      });
    }
  }
  for (const id of unreferencedInfra(root, inv)) {
    findings.push({
      id: `${id}-unreferenced`,
      severity: 'info',
      title: `${id} runs in compose but no source file names it`,
      detail: `Neither the service id nor its container name appears in any code or config file outside compose. It may be reached through a URL in the environment, or it may be unused.`,
      nodeId: id,
    });
  }
  if (overflow.length) {
    findings.push({
      id: 'layers-not-drawn',
      severity: 'info',
      title: `${overflow.length} director${overflow.length === 1 ? 'y' : 'ies'} not drawn (more than ${MAX_LAYERS_PER_COLUMN} per column)`,
      detail: overflow.join(', '),
    });
  }

  const grounding: MapGrounding[] = [];
  const seenPaths = new Set<string>();
  const ground = (id: string, path: string) => {
    if (seenPaths.has(path)) return;
    seenPaths.add(path);
    grounding.push({ id, path });
  };
  [...new Set(inv.compose.map((s) => s.file))].forEach((f, i) => ground(i === 0 ? 'compose' : `compose-${i + 1}`, f));
  if (isFile(join(root, 'package.json'))) ground('workspace', 'package.json');
  for (const u of inv.units) {
    if (u.manifest) ground(`${u.id}-manifest`, u.manifest);
    if (u.hasDockerfile) ground(`${u.id}-dockerfile`, u.path === '.' ? 'Dockerfile' : `${u.path}/Dockerfile`);
  }

  const composeNote = inv.compose.length
    ? [...new Set(inv.compose.map((s) => s.file))].join(', ')
    : 'no compose file';
  const manifestCount = inv.units.filter((u) => u.manifest).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    title: `${name} — repository surface`,
    intent: `Everything that runs and where code lives, read from ${composeNote} and ${manifestCount} manifest${
      manifestCount === 1 ? '' : 's'
    }. No path is traced here; use the flow command for that.`,
    query: { mode: 'repo', name },
    generatedAt: opts.generatedAt ?? new Date().toISOString(),
    infra,
    processes,
    columns,
    hops: [],
    findings,
    grounding,
    unknown: [],
  };
}
