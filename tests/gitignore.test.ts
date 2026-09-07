import { describe, expect, test } from 'bun:test';

import { alreadyIgnoresArchitectureMap } from '../plugins/architecture-map/skills/architecture-map/runtime/gitignore';

describe('alreadyIgnoresArchitectureMap', () => {
  test('recognises equivalent spellings and a negation as already handled', () => {
    expect(alreadyIgnoresArchitectureMap('')).toBe(false);
    expect(alreadyIgnoresArchitectureMap('node_modules\n')).toBe(false);
    expect(alreadyIgnoresArchitectureMap('# .architecture-map/\n')).toBe(false);
    expect(alreadyIgnoresArchitectureMap('.architecture-map/\n')).toBe(true);
    expect(alreadyIgnoresArchitectureMap('.architecture-map\n')).toBe(true);
    expect(alreadyIgnoresArchitectureMap('/.architecture-map/\n')).toBe(true);
    expect(alreadyIgnoresArchitectureMap('!.architecture-map/\n')).toBe(true);
  });
});
