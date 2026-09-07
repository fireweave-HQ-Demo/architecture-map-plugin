/**
 * Repository inventory — what exists on disk, mechanically.
 *
 * No guest list of names. Everything here is derived from files that are
 * actually present: compose files, workspace manifests, directory layout.
 * A new service or package shows up without editing this file. When the
 * heuristics cannot classify something, the inventory says so in
 * `findings` instead of inventing a shape.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

import type { ColumnKind } from './schema';

export const INVENTORY_SCHEMA_VERSION = 1;

export interface ComposeService {
  /** Service key in the compose file. */
  id: string;
  containerName: string | null;
  image: string | null;
  /** Build context when the service is built from this repo. */
  build: string | null;
  workingDir: string | null;
  /** Repo-relative compose file path. */
  file: string;
  /**
   * `process` when the service runs code from this repo — it has `build:`,
   * or its `working_dir` ends in a code unit's path (dev stacks that mount
   * the workspace into a stock runtime image). `infra` when it only pulls
   * an image.
   */
  band: 'infra' | 'process';
  /** Code unit this process runs, when `working_dir` or `build` resolves to one. */
  unit: string | null;
  /**
   * Other service ids this service's compose block names — in `depends_on`,
   * `links`, or connection URLs in `environment`. Wiring evidence, no code read.
   */
  refs: string[];
}

export interface UnitRecord {
  /** Stable id: repo-relative path with `/` → `-`, or basename for root. */
  id: string;
  /** Repo-relative directory (`.` for the repository itself). */
  path: string;
  kind: 'app' | 'package' | 'root';
  layout: ColumnKind;
  /** Repo-relative paths that justified `layout`. */
  markers: string[];
  hasDockerfile: boolean;
  /** Repo-relative manifest path (package.json, Cargo.toml, go.mod, …). */
  manifest: string | null;
  /**
   * Unit-relative directories, two levels deep (`src`, `src/routes`, …).
   * Plan checks use these to tell an existing layer from a proposed one.
   */
  dirs: string[];
}

export interface FeatureFiles {
  routes: string[];
  handlers: string[];
  persistence: string[];
  messaging: string[];
  jobs: string[];
}

export interface FeatureRecord {
  /** Owning unit id. */
  unit: string;
  name: string;
  /** Repo-relative directory. */
  path: string;
  layers: { domain: boolean; application: boolean; infrastructure: boolean };
  /** Feature-relative top-level directories (the layers that exist). */
  dirs: string[];
  files: FeatureFiles;
}

export interface Inventory {
  schemaVersion: typeof INVENTORY_SCHEMA_VERSION;
  generatedAt: string;
  /** Absolute path the inventory was taken from. */
  repoRoot: string;
  /** Repo-relative compose files the services were read from (one stack). */
  composeFiles: string[];
  compose: ComposeService[];
  units: UnitRecord[];
  features: FeatureRecord[];
  findings: string[];
}

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

const MANIFESTS = [
  'package.json',
  'Cargo.toml',
  'go.mod',
  'pyproject.toml',
  'setup.py',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'composer.json',
  'mix.exs',
];

const COMPOSE_NAME = /^(docker-)?compose(\.[\w.-]+)?\.ya?ml$/;
const COMPOSE_DIRS = [
  'infra',
  'infrastructure',
  'deploy',
  'deployment',
  'deployments',
  'docker',
  'compose',
  'ops',
  'devops',
  '.devcontainer',
];

const CONVENTIONAL_UNIT_DIRS = [
  'apps',
  'services',
  'packages',
  'libs',
  'crates',
  'cmd',
];

const FEATURE_DIRS = ['src/features', 'src/modules', 'features', 'modules'];

const LAYER_NAMES = ['domain', 'application', 'infrastructure'] as const;

const FILE_CAP = 20;

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
    .filter((d) => d.isDirectory() && !IGNORED_DIRS.has(d.name))
    .map((d) => d.name)
    .sort();
}

function listFiles(p: string): string[] {
  if (!isDir(p)) return [];
  return readdirSync(p, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
}

function walkFiles(dir: string, maxDepth: number, depth = 0): string[] {
  if (!isDir(dir) || depth > maxDepth) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      out.push(...walkFiles(join(dir, entry.name), maxDepth, depth + 1));
    } else if (entry.isFile()) {
      out.push(join(dir, entry.name));
    }
  }
  return out.sort();
}

function rel(root: string, abs: string): string {
  const r = relative(root, abs).split('\\').join('/');
  return r === '' ? '.' : r;
}

/** Directories under `dir`, `depth` levels deep, as `dir`-relative paths. */
function dirsUnder(dir: string, depth: number): string[] {
  const out: string[] = [];
  for (const a of listDirs(dir)) {
    out.push(a);
    if (depth > 1) {
      for (const b of listDirs(join(dir, a))) out.push(`${a}/${b}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Compose
// ---------------------------------------------------------------------------

export function findComposeFiles(root: string): string[] {
  const found = new Set<string>();
  for (const name of listFiles(root)) {
    if (COMPOSE_NAME.test(name)) found.add(join(root, name));
  }
  for (const dir of COMPOSE_DIRS) {
    const abs = join(root, dir);
    if (!isDir(abs)) continue;
    for (const file of walkFiles(abs, 3)) {
      if (COMPOSE_NAME.test(basename(file))) found.add(file);
    }
  }
  return [...found].sort();
}

const DEV_SEGMENT = /^(dev|development|local|localhost)$/i;
const NON_PRIMARY_SEGMENT =
  /^(test|tests|testing|e2e|ci|prod|production|staging|stage|preview|\.devcontainer)$/i;

/**
 * One repository often carries several stacks (dev, test, prod, the
 * devcontainer). A map draws one. Rank: root compose file, then a directory
 * whose path says dev/local, then any other, then test/ci/prod/devcontainer.
 * Every file in the winning directory is part of the stack (overrides,
 * `compose.<part>.yaml` splits); the rest are reported, not merged.
 */
export function selectComposeFiles(
  root: string,
  files: string[]
): { selected: string[]; skipped: string[] } {
  if (files.length === 0) return { selected: [], skipped: [] };
  const rank = (file: string): number => {
    const segments = rel(root, dirname(file)).split('/');
    if (segments.length === 1 && segments[0] === '.') return 0;
    if (segments.some((s) => DEV_SEGMENT.test(s))) return 1;
    if (segments.some((s) => NON_PRIMARY_SEGMENT.test(s))) return 3;
    return 2;
  };
  const best = [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0];
  const dir = dirname(best);
  const selected = files.filter((f) => dirname(f) === dir).sort();
  const skipped = files.filter((f) => dirname(f) !== dir).sort();
  return { selected, skipped };
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function scalar(line: string): string {
  const idx = line.indexOf(':');
  return line
    .slice(idx + 1)
    .trim()
    .replace(/^["']|["']$/g, '');
}

/**
 * Line-oriented parse of `services:` — enough for ids, image, build,
 * container_name, working_dir. Not a YAML parser; anchors and multi-doc
 * files are out of scope and reported as-is (the service still appears).
 */
export function parseComposeServices(
  text: string,
  file: string
): ComposeService[] {
  const lines = text.split(/\r?\n/);
  const services: ComposeService[] = [];
  const blocks = new Map<string, string[]>();
  let servicesIndent = -1;
  let serviceIndent = -1;
  let current: ComposeService | null = null;
  let inBuild = false;
  let buildIndent = -1;

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = indentOf(line);
    const trimmed = line.trim();

    if (servicesIndent === -1) {
      if (/^services:\s*$/.test(trimmed)) servicesIndent = indent;
      continue;
    }
    if (indent <= servicesIndent) {
      servicesIndent = -1;
      current = null;
      continue;
    }
    if (serviceIndent === -1 || indent === serviceIndent) {
      if (serviceIndent === -1) serviceIndent = indent;
      const m = /^([\w.-]+):\s*$/.exec(trimmed);
      if (m && indent === serviceIndent) {
        current = {
          id: m[1],
          containerName: null,
          image: null,
          build: null,
          workingDir: null,
          file,
          band: 'infra',
          unit: null,
          refs: [],
        };
        services.push(current);
        blocks.set(current.id, []);
        inBuild = false;
        continue;
      }
    }
    if (!current || indent <= serviceIndent) continue;
    blocks.get(current.id)?.push(trimmed);

    if (inBuild) {
      if (indent > buildIndent) {
        if (/^context:/.test(trimmed)) current.build = scalar(trimmed) || '.';
        continue;
      }
      inBuild = false;
    }
    if (/^image:/.test(trimmed)) current.image = scalar(trimmed) || null;
    else if (/^container_name:/.test(trimmed)) {
      current.containerName = scalar(trimmed) || null;
    } else if (/^working_dir:/.test(trimmed)) {
      current.workingDir = scalar(trimmed) || null;
    } else if (/^build:/.test(trimmed)) {
      const value = scalar(trimmed);
      if (value) current.build = value;
      else {
        current.build = '.';
        inBuild = true;
        buildIndent = indent;
      }
    }
  }

  for (const s of services) {
    s.band = s.build !== null ? 'process' : 'infra';
    const block = (blocks.get(s.id) ?? []).join('\n');
    s.refs = services
      .filter((other) => other.id !== s.id)
      .filter((other) => new RegExp(`(^|[^\\w.-])${escapeRegExp(other.id)}(?![\\w-])`, 'm').test(block))
      .map((other) => other.id);
  }
  return services;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Units (workspaces / apps / packages)
// ---------------------------------------------------------------------------

function readJson(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function workspacePatterns(root: string): string[] {
  const patterns: string[] = [];
  const pkg = readJson(join(root, 'package.json'));
  if (pkg) {
    const ws = pkg.workspaces;
    if (Array.isArray(ws)) patterns.push(...ws.filter(isString));
    else if (ws && typeof ws === 'object') {
      const inner = (ws as Record<string, unknown>).packages;
      if (Array.isArray(inner)) patterns.push(...inner.filter(isString));
    }
  }
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (isFile(pnpm)) {
    for (const line of readFileSync(pnpm, 'utf8').split(/\r?\n/)) {
      const m = /^\s*-\s*["']?([^"'#]+?)["']?\s*$/.exec(line);
      if (m) patterns.push(m[1].trim());
    }
  }
  const cargo = join(root, 'Cargo.toml');
  if (isFile(cargo)) {
    const text = readFileSync(cargo, 'utf8');
    const block = /\[workspace\][\s\S]*?members\s*=\s*\[([\s\S]*?)\]/.exec(text);
    if (block) {
      for (const m of block[1].matchAll(/["']([^"']+)["']/g)) patterns.push(m[1]);
    }
  }
  const gowork = join(root, 'go.work');
  if (isFile(gowork)) {
    for (const line of readFileSync(gowork, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:use\s+)?\.\/([\w./-]+)\s*$/.exec(line);
      if (m && !/^\s*(go|toolchain)\b/.test(line)) patterns.push(m[1]);
    }
  }
  return patterns.filter((p) => !p.startsWith('!'));
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function expandPattern(root: string, pattern: string): string[] {
  const clean = pattern.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!clean.includes('*')) {
    const abs = join(root, clean);
    return isDir(abs) ? [abs] : [];
  }
  const star = clean.indexOf('*');
  const base = clean.slice(0, star).replace(/\/+$/, '');
  const rest = clean.slice(star);
  const baseAbs = join(root, base);
  if (!isDir(baseAbs)) return [];
  if (rest === '**' || rest === '**/*') {
    const out: string[] = [];
    const walk = (dir: string, depth: number) => {
      if (depth > 3) return;
      for (const name of listDirs(dir)) {
        const abs = join(dir, name);
        if (looksLikeUnit(abs)) out.push(abs);
        else walk(abs, depth + 1);
      }
    };
    walk(baseAbs, 0);
    return out;
  }
  return listDirs(baseAbs).map((name) => join(baseAbs, name));
}

function manifestOf(dir: string): string | null {
  for (const name of MANIFESTS) {
    if (isFile(join(dir, name))) return join(dir, name);
  }
  return null;
}

function looksLikeUnit(dir: string): boolean {
  return (
    manifestOf(dir) !== null ||
    isDir(join(dir, 'src')) ||
    isFile(join(dir, 'Dockerfile'))
  );
}

interface Layout {
  layout: ColumnKind;
  markers: string[];
}

function detectLayout(root: string, unitAbs: string, kind: UnitRecord['kind']): Layout {
  const markers: string[] = [];
  const bases = ['', 'src', 'internal', 'lib', 'app'];

  for (const base of bases) {
    const dir = base ? join(unitAbs, base) : unitAbs;
    const present = LAYER_NAMES.filter((l) => isDir(join(dir, l)));
    if (present.length >= 2) {
      present.forEach((l) => markers.push(rel(root, join(dir, l))));
      return { layout: 'layered', markers };
    }
  }
  for (const fdir of FEATURE_DIRS) {
    const dir = join(unitAbs, fdir);
    for (const feature of listDirs(dir)) {
      const present = LAYER_NAMES.filter((l) => isDir(join(dir, feature, l)));
      if (present.length >= 2) {
        present.forEach((l) => markers.push(rel(root, join(dir, feature, l))));
        return { layout: 'layered', markers };
      }
    }
  }

  const routeDirs = ['src/routes', 'routes', 'src/pages', 'pages', 'src/app', 'app'];
  for (const rd of routeDirs) {
    const dir = join(unitAbs, rd);
    if (!isDir(dir)) continue;
    const files = walkFiles(dir, 2).map((f) => basename(f));
    const hasRouteFile = files.some((f) =>
      /^(\+page|\+server|\+layout|page|layout|route|index|_app)\.[cm]?[jt]sx?$|^(\+page|page|index)\.(svelte|vue|astro|md|mdx)$/.test(
        f
      )
    );
    if (hasRouteFile || rd.endsWith('routes') || rd.endsWith('pages')) {
      markers.push(rel(root, dir));
      return { layout: 'routes', markers };
    }
  }

  if (kind === 'package') return { layout: 'library', markers };
  return { layout: 'unknown', markers };
}

function unitKind(root: string, unitAbs: string, hasDockerfile: boolean): UnitRecord['kind'] {
  const r = rel(root, unitAbs);
  if (r === '.') return 'root';
  const top = r.split('/')[0];
  if (top === 'packages' || top === 'libs' || top === 'crates') return 'package';
  if (top === 'apps' || top === 'services' || top === 'cmd') return 'app';
  if (hasDockerfile) return 'app';
  return 'package';
}

/**
 * apps/api → api; packages/shared → shared; deeper paths still use their
 * last segment. `discoverUnits` falls back to the full path form when two
 * units would share an id.
 */
function unitId(root: string, unitAbs: string): string {
  const r = rel(root, unitAbs);
  if (r === '.') return basename(resolve(root));
  return basename(r);
}

export function discoverUnits(root: string): UnitRecord[] {
  const dirs = new Set<string>();
  for (const pattern of workspacePatterns(root)) {
    expandPattern(root, pattern).forEach((d) => dirs.add(d));
  }
  for (const conv of CONVENTIONAL_UNIT_DIRS) {
    const abs = join(root, conv);
    if (!isDir(abs)) continue;
    for (const name of listDirs(abs)) {
      const d = join(abs, name);
      if (looksLikeUnit(d)) dirs.add(d);
    }
  }

  const units: UnitRecord[] = [];
  const seenIds = new Map<string, number>();
  for (const abs of [...dirs].sort()) {
    // A glob can match a plain folder (packages/tools holding nested units);
    // only directories with a manifest, src/ or Dockerfile are code units.
    if (!isDir(abs) || !looksLikeUnit(abs)) continue;
    const hasDockerfile = isFile(join(abs, 'Dockerfile'));
    const kind = unitKind(root, abs, hasDockerfile);
    const { layout, markers } = detectLayout(root, abs, kind);
    let id = unitId(root, abs);
    const n = seenIds.get(id) || 0;
    seenIds.set(id, n + 1);
    if (n > 0) id = rel(root, abs).split('/').join('-');
    const manifest = manifestOf(abs);
    units.push({
      id,
      path: rel(root, abs),
      kind,
      layout,
      markers,
      hasDockerfile,
      manifest: manifest ? rel(root, manifest) : null,
      dirs: dirsUnder(abs, 2),
    });
  }

  if (units.length === 0) {
    const hasDockerfile = isFile(join(root, 'Dockerfile'));
    const { layout, markers } = detectLayout(root, root, 'root');
    const manifest = manifestOf(root);
    units.push({
      id: unitId(root, root),
      path: '.',
      kind: 'root',
      layout,
      markers,
      hasDockerfile,
      manifest: manifest ? rel(root, manifest) : null,
      dirs: dirsUnder(root, 2),
    });
  }
  return units;
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const ROLE_PATTERNS: Record<keyof FeatureFiles, RegExp> = {
  routes:
    /(\/routes?\/|\/http\/|\/api\/|\/controllers?\/|\.routes?\.|\.router\.|\.controller\.|\+server\.|\/route\.[cm]?[jt]s$|\.endpoint\.)/i,
  handlers:
    /(\/application\/|\/use-?cases?\/|\/services?\/|\/handlers?\/|\.use-?case\.|\.service\.|\.handler\.|\.command\.|\.query\.)/i,
  persistence:
    /(\/persistence\/|\/repositor(y|ies)\/|\/db\/|\/database\/|\/models?\/|\/entities\/|\/migrations?\/|\.repository\.|\.repo\.|\.model\.|\.entity\.|\.schema\.|\.migration\.)/i,
  messaging:
    /(\/queue\/|\/queues\/|\/events?\/|\/messaging\/|\/consumers?\/|\/producers?\/|\/subscribers?\/|\.consumer\.|\.producer\.|\.publisher\.|\.subscriber\.|\.listener\.|\.event\.)/i,
  jobs: /(\/jobs?\/|\/cron\/|\/workflows?\/|\/sagas?\/|\/schedulers?\/|\.job\.|\.cron\.|\.workflow\.|\.saga\.|\.scheduler\.|\.task\.)/i,
};

const TEST_FILE = /(\.(test|spec)\.|__tests__\/|\/tests?\/|\/fixtures?\/)/i;

export function discoverFeatures(root: string, units: UnitRecord[]): FeatureRecord[] {
  const features: FeatureRecord[] = [];
  for (const unit of units) {
    const unitAbs = unit.path === '.' ? root : join(root, unit.path);
    for (const fdir of FEATURE_DIRS) {
      const dir = join(unitAbs, fdir);
      for (const name of listDirs(dir)) {
        const featureAbs = join(dir, name);
        const files: FeatureFiles = {
          routes: [],
          handlers: [],
          persistence: [],
          messaging: [],
          jobs: [],
        };
        for (const abs of walkFiles(featureAbs, 6)) {
          const r = rel(root, abs);
          // Roles are about position inside the feature, so the probe is the
          // feature-relative path: `apps/api/...` must not read as `/api/`.
          const probe = '/' + rel(featureAbs, abs);
          if (TEST_FILE.test(probe)) continue;
          (Object.keys(ROLE_PATTERNS) as Array<keyof FeatureFiles>).forEach(
            (role) => {
              if (ROLE_PATTERNS[role].test(probe) && files[role].length < FILE_CAP) {
                files[role].push(r);
              }
            }
          );
        }
        features.push({
          unit: unit.id,
          name,
          path: rel(root, featureAbs),
          layers: {
            domain: isDir(join(featureAbs, 'domain')),
            application: isDir(join(featureAbs, 'application')),
            infrastructure: isDir(join(featureAbs, 'infrastructure')),
          },
          dirs: dirsUnder(featureAbs, 1),
          files,
        });
      }
    }
  }
  return features;
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export interface InventoryOptions {
  /**
   * Compose file(s) to read instead of the auto-selected stack. Repo-relative
   * or absolute. Use this when the repository carries several stacks and the
   * map should draw a specific one.
   */
  composeFiles?: string[];
}

/** The unit whose repo path ends the given container path, if any. */
function unitForContainerPath(units: UnitRecord[], containerPath: string): UnitRecord | null {
  const clean = containerPath.replace(/\/+$/, '');
  const candidates = units
    .filter((u) => u.path !== '.' && (clean === u.path || clean.endsWith(`/${u.path}`)))
    .sort((a, b) => b.path.length - a.path.length);
  return candidates[0] ?? null;
}

export function buildInventory(rootInput: string, opts: InventoryOptions = {}): Inventory {
  const root = resolve(rootInput);
  if (!isDir(root)) {
    throw new Error(`inventory: not a directory: ${root}`);
  }
  const findings: string[] = [];

  let selected: string[];
  let skipped: string[] = [];
  if (opts.composeFiles?.length) {
    selected = opts.composeFiles.map((f) => resolve(root, f));
    for (const f of selected) {
      if (!isFile(f)) throw new Error(`inventory: compose file not found: ${f}`);
    }
  } else {
    ({ selected, skipped } = selectComposeFiles(root, findComposeFiles(root)));
  }

  const units = discoverUnits(root);

  const compose: ComposeService[] = [];
  const duplicated = new Set<string>();
  for (const file of selected) {
    const relFile = rel(root, file);
    for (const svc of parseComposeServices(readFileSync(file, 'utf8'), relFile)) {
      const first = compose.find((c) => c.id === svc.id);
      if (first) {
        if (!duplicated.has(svc.id)) {
          duplicated.add(svc.id);
          findings.push(
            `compose service "${svc.id}" is defined in more than one file; kept ${first.file}, ignored ${relFile}`
          );
        }
        continue;
      }
      if (svc.build !== null) {
        const buildAbs = resolve(root, dirname(file), svc.build);
        svc.unit = unitForContainerPath(units, rel(root, buildAbs))?.id ?? null;
      } else if (svc.workingDir) {
        const unit = unitForContainerPath(units, svc.workingDir);
        if (unit) {
          svc.unit = unit.id;
          svc.band = 'process';
        }
      }
      compose.push(svc);
      if (svc.image === null && svc.build === null) {
        findings.push(
          `compose service "${svc.id}" in ${relFile} has neither image nor build; check for YAML anchors or extends`
        );
      }
    }
  }
  if (selected.length === 0) {
    findings.push(
      'no compose file found (compose.yaml / docker-compose.yml at the root or under infra/, deploy/, docker/); the infra band must come from another source of truth — ask, do not guess'
    );
  }
  if (skipped.length) {
    findings.push(
      `other compose stacks exist and were not merged: ${skipped
        .map((f) => rel(root, f))
        .join(', ')} — pass --compose <file> to map one of them instead`
    );
  }

  for (const unit of units) {
    if (unit.layout === 'unknown') {
      findings.push(
        `unit "${unit.id}" (${unit.path}) has no recognisable layout (no domain/application/infrastructure, no routes/pages/app directory); draw it as kind unknown`
      );
    }
  }
  if (units.length === 1 && units[0].kind === 'root') {
    findings.push(
      'no workspaces or apps/packages directories found; the repository root is the only code unit'
    );
  }

  const features = discoverFeatures(root, units);

  return {
    schemaVersion: INVENTORY_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repoRoot: root,
    composeFiles: selected.map((f) => rel(root, f)),
    compose,
    units,
    features,
    findings,
  };
}