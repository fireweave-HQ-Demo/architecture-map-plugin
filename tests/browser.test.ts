/**
 * Runs the rendered HTML in a DOM (happy-dom) and exercises the shell's
 * script: boot, hop list, inspector, PR before/after, filters, repo empty
 * state, deep links. This is the closest offline stand-in for opening the
 * file in a browser.
 */

import { afterEach, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { injectMap, loadShell } from '../plugins/architecture-map/skills/architecture-map/runtime/render/inject';
import {
  parseMapDocument,
  type MapDocument,
} from '../plugins/architecture-map/skills/architecture-map/runtime/schema';
import { loadAllFixtures, loadFixture } from './helpers';

const shell = await loadShell();
const windows: Window[] = [];

/** The shell's one inline script (the JSON payload script is skipped). */
function inlineScript(html: string): string {
  const scripts = [...html.matchAll(/<script(?![^>]*type=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1) throw new Error(`expected one inline script, found ${scripts.length}`);
  return scripts[0][1];
}

async function open(map: MapDocument, hash = '') {
  const html = injectMap(shell, map, { repoRoot: '/repo' });
  const window = new Window({
    url: 'http://localhost/map.html' + hash,
    settings: {
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
      // Bun has no vm-backed `window.eval`; the script is run below instead.
      disableJavaScriptEvaluation: true,
    },
  });
  const errors: string[] = [];
  window.addEventListener('error', (ev) => {
    errors.push(String((ev as unknown as { message?: string }).message ?? ev));
  });
  window.document.write(html);
  await window.happyDOM.waitUntilComplete();
  try {
    // Same effect as the browser evaluating the classic script: DOM globals
    // resolve against the window, JS builtins (which happy-dom leaves
    // undefined without a VM context) fall through to the real ones, and
    // top-level declarations stay private to the script.
    const scope = new Proxy(window as unknown as Record<PropertyKey, unknown>, {
      has: (target, key) => typeof key === 'string' && key in target && target[key] !== undefined,
    });
    new Function('window', 'scope', `with (scope) {\n${inlineScript(html)}\n}`)(window, scope);
  } catch (err) {
    errors.push(String((err as Error).stack ?? err));
  }
  windows.push(window);
  const doc = window.document;
  return {
    window,
    doc,
    errors,
    text: (sel: string) => doc.querySelector(sel)?.textContent?.trim() ?? '',
    all: (sel: string) => Array.from(doc.querySelectorAll(sel)),
    click: (sel: string) => {
      const el = doc.querySelector(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    },
    key: (key: string) => {
      doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
    },
  };
}

afterEach(async () => {
  while (windows.length) await windows.pop()!.happyDOM.close();
});

const flow = parseMapDocument(await loadFixture('flow-create-order.map.json'));
const repo = parseMapDocument(await loadFixture('repo-sample.map.json'));
const pr = parseMapDocument(await loadFixture('pr-create-order-outbox.map.json'));
const planFail = parseMapDocument(await loadFixture('plan-fail-orders-cache-cron.map.json'));
const planBlocked = parseMapDocument(await loadFixture('plan-blocked-missing-entry.map.json'));
const prBlocked = parseMapDocument(await loadFixture('pr-blocked-missing-flow.map.json'));

describe('boot', () => {
  test('every golden boots without script errors and paints its title', async () => {
    for (const { name, raw } of await loadAllFixtures()) {
      const map = parseMapDocument(raw);
      const page = await open(map);
      expect(page.errors, name).toEqual([]);
      expect(page.text('#title'), name).toBe(map.title);
      expect(page.doc.title, name).toContain(map.title);
      expect(page.doc.querySelector('.boot-fail'), name).toBeNull();
    }
  });
});

describe('flow', () => {
  test('lists every hop, selects the first, and the inspector tells the full story', async () => {
    const page = await open(flow);
    expect(page.all('.hop[data-hop]')).toHaveLength(flow.hops.length);
    expect(page.all('.path-pill[data-hop]')).toHaveLength(flow.hops.length);
    expect(page.text('#kicker')).toContain('FLOW');
    expect(page.text('#kicker')).toContain(`${flow.hops.length} hops`);
    expect(page.doc.querySelector('.hop[aria-selected="true"]')?.getAttribute('data-hop')).toBe('1');
    expect(page.text('#inspector .story')).toBe(flow.hops[0].work);
    expect(page.text('#inspector')).toContain('arrives with');
    expect(page.text('#inspector')).toContain(flow.hops[0].in!);
    expect(page.text('#inspector')).toContain('if this fails');
    expect(page.doc.querySelector('#inspector .inspector-file a')?.getAttribute('href')).toBe(
      'vscode://file/repo/' + flow.hops[0].source
    );
  });

  test('clicking a hop moves the selection, keyboard walks the path, Esc clears', async () => {
    const page = await open(flow);
    page.click('.hop[data-hop="6"]');
    expect(page.text('#inspector .story')).toBe(flow.hops[5].work);
    expect(page.text('#inspector')).toContain('why');
    expect(page.text('#inspector')).toContain('not this');
    expect(page.window.location.hash).toBe('#hop=6');
    page.key('ArrowDown');
    expect(page.window.location.hash).toBe('#hop=7');
    page.key('k');
    expect(page.window.location.hash).toBe('#hop=6');
    page.key('Escape');
    expect(page.text('#inspector')).toContain('Select a step.');
  });

  test('clicking a box shows its files and touching hops; idle boxes are tagged', async () => {
    const page = await open(flow);
    page.click('[data-node="postgres"]');
    const text = page.text('#inspector');
    expect(text).toContain('postgres');
    expect(text).toContain('hops in / out');
    expect(text).toMatch(/6 in · database/);
    expect(page.window.location.hash).toBe('#node=postgres');
    const redis = page.doc.querySelector('[data-node="redis"]')!;
    expect(redis.className).toContain('unused');
    expect(redis.textContent).toContain('idle');
  });

  test('deep link #hop=N selects that hop on load', async () => {
    const page = await open(flow, '#hop=3');
    expect(page.doc.querySelector('.hop[aria-selected="true"]')?.getAttribute('data-hop')).toBe('3');
    expect(page.text('#inspector .story')).toBe(flow.hops[2].work);
  });

  test('legend lists only the touch types present on this map', async () => {
    const page = await open(flow);
    const chips = page.all('#legend .type-key').map((c) => c.textContent);
    const present = [...new Set(flow.hops.map((h) => h.type))];
    expect(chips.sort()).toEqual(present.sort());
    expect(chips).not.toContain('gRPC');
  });
});

describe('repo', () => {
  test('shows the surface with no hops, a surface heading, and box-first inspector copy', async () => {
    const page = await open(repo);
    expect(page.all('.hop[data-hop]')).toHaveLength(0);
    expect(page.text('#kicker')).toContain('REPO');
    expect(page.text('#kicker')).toContain(`${repo.columns.length} code units`);
    expect(page.text('#hops h2')).toBe('Surface');
    expect(page.text('#hops .hint')).toContain('No path traced.');
    expect(page.text('#inspector')).toContain('Select a box to see what lives there.');
    expect(page.text('#hint')).toContain('repository surface');
    expect(page.all('#legend .type-key')).toHaveLength(0);
    expect((page.doc.querySelector('#play-path') as { disabled?: boolean } | null)?.disabled).toBe(true);
    expect(page.all('#findings .finding')).toHaveLength(repo.findings!.length);
    expect(page.doc.querySelector('#platform')?.hasAttribute('open')).toBe(true);
  });

  test('every column and layer is drawn and clickable', async () => {
    const page = await open(repo);
    expect(page.all('.column')).toHaveLength(repo.columns.length);
    page.click('[data-node="api/orders/infrastructure"]');
    expect(page.text('#inspector')).toContain('api/orders/infrastructure');
    expect(page.text('#inspector')).toContain('outbox.relay.ts');
    expect(page.text('#inspector')).not.toContain('hops in / out');
  });
});

describe('pr', () => {
  test('after view hides removed, before view hides added; the changed hop shows before/after', async () => {
    const page = await open(pr);
    expect(page.text('#kicker')).toContain('PR #42');
    expect(page.text('#pr-bar')).toContain('This PR adds 1 step, removes 1 step, changes 1 step');
    // First list is the path; a second list holds the hops not on this view.
    const listed = (which = 0) =>
      [...page.all('#hops .hop-list')[which]!.querySelectorAll('.hop[data-hop]')].map((h) =>
        h.getAttribute('data-hop'),
      );
    expect(listed()).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(listed(1)).toEqual(['11']);
    expect(page.text('#hops h2')).toBe('Path on this PR');
    expect(page.text('#hops')).toContain('Removed by this PR');

    page.click('.hop[data-hop="6"]');
    expect(page.text('#inspector')).toContain('before');
    expect(page.text('#inspector')).toContain(pr.hops[5].beforeWork!);
    expect(page.text('#inspector')).toContain('on this PR');
    expect(page.text('#inspector')).toContain(pr.hops[5].work);

    page.click('[data-view="before"]');
    expect(page.text('#hops h2')).toBe('Path before this PR');
    expect(listed()).toEqual(['1', '2', '3', '4', '5', '6', '8', '9', '10', '11']);
    expect(listed(1)).toEqual(['7']);
    expect(page.text('#hops')).toContain('this PR adds them');
  });

  test('focus filters narrow the list to one status', async () => {
    const page = await open(pr);
    page.click('[data-filter="added"]');
    expect(page.all('.hop-list .hop[data-hop]').map((h) => h.getAttribute('data-hop'))).toEqual(['7']);
    expect(page.text('#hops h2')).toBe('Added by this PR');
    page.click('[data-filter="all"]');
    // 10 on the path plus the one removed hop in its own section.
    expect(page.all('.hop-list .hop[data-hop]')).toHaveLength(pr.hops.length);
  });

  test('legend explains the four PR states', async () => {
    const page = await open(pr);
    const legend = page.text('#legend');
    for (const word of ['same as before', 'added by this PR', 'removed by this PR', 'changed on this PR']) {
      expect(legend).toContain(word);
    }
  });
});

describe('plan', () => {
  test('verdict, findings, proposed and conflict styling, status filter chips', async () => {
    const page = await open(planFail);
    expect(page.text('#verdict')).toContain('fail');
    expect(page.all('#findings .finding.conflict')).toHaveLength(1);
    expect(page.doc.querySelector('.box[data-node="reports"]')?.getAttribute('data-status')).toBe('proposed');
    expect(page.doc.querySelector('.hop[data-hop="5"]')?.getAttribute('data-status')).toBe('conflict');
    expect(page.all('#toolbar [data-filter]').map((b) => b.getAttribute('data-filter'))).toEqual([
      'all',
      'existing',
      'proposed',
      'conflict',
    ]);
    page.click('#toolbar [data-filter="proposed"]');
    const dimmed = page.all('.hop[data-hop].is-dim').map((h) => h.getAttribute('data-hop'));
    expect(dimmed).toContain('1');
    expect(dimmed).toContain('5');
    expect(dimmed).not.toContain('2');
  });

  test('a finding click jumps to its hop or node', async () => {
    const page = await open(planFail);
    page.click('[data-finding="double-billing"]');
    expect(page.window.location.hash).toBe('#hop=5');
    page.click('[data-finding="reports-new-process"]');
    expect(page.window.location.hash).toBe('#node=reports');
  });
});

describe('blocked', () => {
  test('blocked plan and blocked PR show questions, no hops, collapsed platform', async () => {
    for (const map of [planBlocked, prBlocked]) {
      const page = await open(map);
      expect(page.text('#questions h2')).toBe('Ask — do not guess');
      expect(page.all('#questions li')).toHaveLength(map.questions!.length);
      expect(page.all('.hop[data-hop]')).toHaveLength(0);
      expect(page.text('#hops .hint')).toContain('Answer the questions in chat first.');
      expect(page.doc.querySelector('#platform')?.hasAttribute('open')).toBe(false);
      expect(page.text('#platform-summary')).toContain('idle');
      expect((page.doc.querySelector('#pr-bar') as { hidden?: boolean } | null)?.hidden).toBe(true);
    }
  });
});
