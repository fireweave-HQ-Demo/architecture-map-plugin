/**
 * Distribution hygiene: the thing under plugins/ must be installable by a
 * stranger's agent, on any repository, without this monorepo around it.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { TOUCH_TYPES } from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { PLUGIN_DIR, REPO_ROOT, RUNTIME_DIR, SKILL_DIR } from './helpers';

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'rendered') continue;
      out.push(...walk(p));
    } else out.push(p);
  }
  return out.sort();
}

function frontmatter(md: string): Record<string, string> {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(md);
  if (!m) return {};
  const out: Record<string, string> = {};
  let key = '';
  for (const line of m[1].split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      out[key] = kv[2].replace(/^>-?$/, '').trim();
    } else if (key && /^\s+/.test(line)) {
      out[key] = (out[key] + ' ' + line.trim()).trim();
    }
  }
  return out;
}

const claude = readJson(join(PLUGIN_DIR, '.claude-plugin/plugin.json'));
const cursor = readJson(join(PLUGIN_DIR, '.cursor-plugin/plugin.json'));
const commandsDir = join(PLUGIN_DIR, 'commands');
const commands = readdirSync(commandsDir).filter((f) => f.endsWith('.md')).sort();

describe('plugin manifests', () => {
  test('both hosts get the same name, version, description and license', () => {
    for (const m of [claude, cursor]) {
      expect(m.name).toBe('architecture-map');
      expect(typeof m.version).toBe('string');
      expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(String(m.description).length).toBeGreaterThan(60);
      expect(m.license).toBe('MIT');
      expect((m.author as { name: string }).name).toBeTruthy();
      expect(Array.isArray(m.keywords)).toBe(true);
    }
    expect(cursor.version).toBe(claude.version);
    expect(cursor.description).toBe(claude.description);
    expect(cursor.displayName).toBe('Architecture Map');
  });

  test('declared skills and commands directories exist', () => {
    for (const m of [claude, cursor]) {
      expect(statSync(join(PLUGIN_DIR, String(m.skills))).isDirectory()).toBe(true);
      expect(statSync(join(PLUGIN_DIR, String(m.commands))).isDirectory()).toBe(true);
    }
  });

  test('marketplace manifests point at the plugin directory and agree on the name', () => {
    const claudeMarket = readJson(join(REPO_ROOT, '.claude-plugin/marketplace.json'));
    const cursorMarket = readJson(join(REPO_ROOT, '.cursor-plugin/marketplace.json'));
    for (const market of [claudeMarket, cursorMarket]) {
      expect(market.name).toBe('architecture-map');
      expect((market.owner as { name: string }).name).toBeTruthy();
      const plugins = market.plugins as Array<{ name: string; source: string; description: string }>;
      expect(plugins).toHaveLength(1);
      expect(plugins[0].name).toBe(String(claude.name));
      expect(plugins[0].description.length).toBeGreaterThan(40);
      expect(statSync(join(REPO_ROOT, plugins[0].source)).isDirectory()).toBe(true);
      expect(existsSync(join(REPO_ROOT, plugins[0].source, '.claude-plugin/plugin.json'))).toBe(true);
    }
    expect(claudeMarket.$schema).toContain('marketplace.schema.json');
  });

  test('CHANGELOG has an entry for the current version', () => {
    const changelog = readFileSync(join(PLUGIN_DIR, 'CHANGELOG.md'), 'utf8');
    expect(changelog).toContain(`## ${claude.version}`);
  });
});

describe('skill', () => {
  const skillMd = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');
  const fm = frontmatter(skillMd);

  test('frontmatter has name and a description that says when to use it', () => {
    expect(fm.name).toBe('architecture-map');
    expect(fm.description.length).toBeGreaterThan(120);
    expect(fm.description.length).toBeLessThan(1024);
    expect(fm.description).toMatch(/Use when/);
  });

  test('every file the skill table names exists', () => {
    const refs = [...skillMd.matchAll(/`(RUNTIME\/[\w./*-]+|references\/[\w.-]+\.md)`/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(8);
    for (const ref of new Set(refs)) {
      const path = ref.startsWith('RUNTIME/')
        ? join(RUNTIME_DIR, ref.slice('RUNTIME/'.length).replace(/\/\*\.map\.json$/, ''))
        : join(SKILL_DIR, ref);
      const probe = path.replace(/ · .*$/, '');
      expect(existsSync(probe), ref).toBe(true);
    }
  });

  test('references cover contract, discovery, ask protocol, visual grammar, examples', () => {
    const refs = readdirSync(join(SKILL_DIR, 'references')).sort();
    expect(refs).toEqual([
      'ask-protocol.md',
      'discovery-protocol.md',
      'examples.md',
      'map-contract.md',
      'visual-grammar.md',
    ]);
  });

  test('the map contract lists exactly the runtime touch types', () => {
    const contract = readFileSync(join(SKILL_DIR, 'references/map-contract.md'), 'utf8');
    for (const t of TOUCH_TYPES) expect(contract).toContain(`\`${t}\``);
  });

  test('the skill documents every CLI command the runtime has', () => {
    const cli = readFileSync(join(RUNTIME_DIR, 'cli.ts'), 'utf8');
    const cases = [...cli.matchAll(/case '([a-z-]+)':/g)].map((m) => m[1]);
    expect(cases.sort()).toEqual(['fixtures', 'init', 'inventory', 'merge-pr', 'render', 'validate']);
    for (const c of cases) expect(skillMd).toContain(`\`${c}\``);
  });
});

describe('commands', () => {
  test('one command per mode, each pointing back at the skill and the runtime', () => {
    expect(commands).toEqual(['arch-flow.md', 'arch-init.md', 'arch-plan.md', 'arch-pr.md']);
    for (const file of commands) {
      const md = readFileSync(join(commandsDir, file), 'utf8');
      const fm = frontmatter(md);
      expect(fm.name, file).toBe(file.replace(/\.md$/, ''));
      expect(fm.description.length, file).toBeGreaterThan(60);
      expect(md, file).toContain('skills/architecture-map/SKILL.md');
      expect(md, file).toContain('${CLAUDE_PLUGIN_ROOT}/skills/architecture-map/runtime');
      expect(md, file).toMatch(/bun RUNTIME\/cli\.ts (init|inventory|validate|render|merge-pr)/);
    }
  });

  test('each command names its mode and the mode exists', () => {
    const modes: Record<string, string> = {
      'arch-init.md': 'repo',
      'arch-flow.md': 'flow',
      'arch-plan.md': 'plan',
      'arch-pr.md': 'pr',
    };
    for (const [file, mode] of Object.entries(modes)) {
      expect(readFileSync(join(commandsDir, file), 'utf8')).toContain(`(mode \`${mode}\`)`);
    }
  });
});

describe('portability', () => {
  const files = walk(PLUGIN_DIR);

  test('nothing in the plugin names the monorepo it was extracted from', () => {
    // The published GitHub home may include an org name that happens to
    // match a banned token — strip those URLs / install refs before scanning.
    const published =
      /https?:\/\/github\.com\/[^\s"'`)]+|fireweave-HQ-Demo\/architecture-map-plugin/gi;
    const banned =
      /fireweave|fw-server|fw-webapp|fw-website|fw-cli|pipekit|restate|\bnats\b|permify|\bvault\b|sveltekit|keystone|charter|\.aidocs|tools\/validate/i;
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(published, '');
      const hit = banned.exec(text);
      expect(hit, `${relative(PLUGIN_DIR, f)}: "${hit?.[0]}"`).toBeNull();
    }
  });

  test('the runtime imports only itself and node builtins', () => {
    for (const f of files.filter((p) => p.startsWith(RUNTIME_DIR) && p.endsWith('.ts'))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/from '([^']+)'/g)) {
        const spec = m[1];
        expect(spec.startsWith('./') || spec.startsWith('node:'), `${relative(PLUGIN_DIR, f)} imports ${spec}`).toBe(true);
      }
    }
  });

  test('no test files, lockfiles or rendered output ship inside the plugin', () => {
    for (const f of files) {
      const r = relative(PLUGIN_DIR, f);
      expect(r).not.toMatch(/\.test\.ts$|bun\.lockb?$|package-lock|node_modules|\/rendered\//);
    }
  });

  test('every markdown link inside the skill resolves', () => {
    for (const f of files.filter((p) => p.endsWith('.md'))) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
        const target = join(f, '..', m[1].split('#')[0]);
        expect(existsSync(target), `${relative(PLUGIN_DIR, f)} → ${m[1]}`).toBe(true);
      }
    }
  });
});
