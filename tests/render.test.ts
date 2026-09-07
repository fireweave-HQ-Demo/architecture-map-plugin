import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

import {
  SHELL_DATA_ATTR,
  SHELL_FINGERPRINT,
  SHELL_MARKER,
  assertLockedShell,
  injectMap,
  loadShell,
  shellPath,
} from '../plugins/architecture-map/skills/architecture-map/runtime/render';
import { parseMapDocument } from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { RUNTIME_DIR, fixtureNames, loadAllFixtures, loadFixture } from './helpers';

const shell = await loadShell();
const flow = parseMapDocument(await loadFixture('flow-create-order.map.json'));

describe('locked shell', () => {
  test('ships next to the runtime with its markers intact', () => {
    expect(shellPath()).toBe(resolve(RUNTIME_DIR, 'shell.html'));
    expect(shell.split(SHELL_MARKER).length - 1).toBe(1);
    expect(shell).toContain(SHELL_FINGERPRINT);
    expect(shell).toContain(SHELL_DATA_ATTR);
    expect(shell).toContain('data-repo-root=""');
  });

  test('interactive affordances are present', () => {
    for (const marker of [
      'id="path-strip"',
      'id="play-path"',
      'id="pr-bar"',
      'id="inspector"',
      'id="hop-overlay"',
      'id="grounding"',
      'prefers-reduced-motion',
      'aria-selected',
      "'ArrowDown'",
      "'Escape'",
      '#hop=',
      '#node=',
      'vscode://file',
    ]) {
      expect(shell, marker).toContain(marker);
    }
  });

  test('inspector reads: work (or before / on this PR), then arrives with, then, if this fails, why, not this, file', () => {
    const body = /function paintInspector\(map\) \{([\s\S]*?)\n {6}\}\n/.exec(shell)?.[1] ?? '';
    const hopBlock = body.slice(0, body.indexOf('if (ui.node)'));
    const labels = [...hopBlock.matchAll(/k\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(labels).toEqual(['before', 'on this PR', 'arrives with', 'then', 'if this fails', 'why', 'not this']);
    expect(hopBlock).toContain("className = 'inspector-file'");
    expect(hopBlock).not.toContain("k('file'");
  });

  test('bundled preview list matches the fixtures on disk', () => {
    const block = /const PREVIEW_MAPS = \[([\s\S]*?)\];/.exec(shell)?.[1] ?? '';
    const listed = [...block.matchAll(/'fixtures\/([^']+)'/g)].map((m) => m[1]).sort();
    expect(listed).toEqual(fixtureNames());
    const def = /const DEFAULT_PREVIEW = 'fixtures\/([^']+)'/.exec(shell)?.[1];
    expect(fixtureNames()).toContain(def!);
  });

  test('repo mode has its own empty-state copy and PR/plan chrome is keyed on mode', () => {
    expect(shell).toContain("mode === 'repo'");
    expect(shell).toContain('No path traced.');
    expect(shell).toContain("h.textContent = 'Surface'");
    expect(shell).toContain('Select a box to see what lives there.');
    expect(shell).toContain("mode === 'pr'");
    expect(shell).toContain("mode === 'plan'");
  });

  test('assertLockedShell rejects a tampered shell', () => {
    expect(() => assertLockedShell(shell.replace(SHELL_MARKER, ''), 'x')).toThrow(/missing/);
    expect(() => assertLockedShell(shell + SHELL_MARKER, 'x')).toThrow(/exactly once/);
    expect(() => assertLockedShell(shell.replace(SHELL_FINGERPRINT, '--accent: red'), 'x')).toThrow(/visual tokens/);
  });
});

describe('injectMap', () => {
  test('replaces the marker exactly once and escapes < in JSON', () => {
    const html = injectMap(shell, { ...flow, title: 'x <script> y' });
    expect(html).not.toContain(SHELL_MARKER);
    expect(html).toContain('x \\u003cscript> y');
    expect(html.split('data-shell="architecture-map-interactive"').length - 1).toBe(1);
  });

  test('embeds repo root as an escaped attribute when given', () => {
    const html = injectMap(shell, flow, { repoRoot: '/tmp/some "quoted" & <path>' });
    expect(html).toContain('data-repo-root="/tmp/some &quot;quoted&quot; &amp; &lt;path>"');
    const plain = injectMap(shell, flow);
    expect(plain).toContain('data-repo-root=""');
  });

  test('embedded JSON round-trips for every golden', async () => {
    for (const { name, raw } of await loadAllFixtures()) {
      const map = parseMapDocument(raw);
      const html = injectMap(shell, map);
      const m = /<script type="application\/json" id="map-data">([\s\S]*?)<\/script>/.exec(html);
      expect(m, name).not.toBeNull();
      expect(JSON.parse(m![1]), name).toEqual(map);
    }
  });

  test('refuses to inject into anything that is not the locked shell', () => {
    expect(() => injectMap('<html></html>', flow)).toThrow(/Locked shell missing/);
  });
});
