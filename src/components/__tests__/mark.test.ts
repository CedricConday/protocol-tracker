import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * SunMascot must draw the same three paths as assets/mascot/sun-mascot.svg.
 *
 * The mark existed in five copies until 2026-09-21 and they disagreed: three
 * ink faces, two white, three different ray silhouettes. Every copy had been
 * made by hand and nothing tied them together, so each one drifted on its own
 * schedule and the site ended up showing two different suns on one page.
 *
 * scripts/mark.py regenerates the asset files from that master. It cannot
 * rewrite a TSX component, so this is the half that catches the component.
 */
const root = join(__dirname, '..', '..', '..');
const svg = readFileSync(join(root, 'assets', 'mascot', 'sun-mascot.svg'), 'utf8');
const tsx = readFileSync(join(root, 'src', 'components', 'SunMascot.tsx'), 'utf8');

function pathsOf(source: string): string[] {
  return [...source.matchAll(/d="(M[^"]+)"/g)].map((m) => m[1]);
}

describe('the mascot has one master', () => {
  it('the master carries exactly three paths', () => {
    expect(pathsOf(svg)).toHaveLength(3);
  });

  it('SunMascot draws the master unchanged', () => {
    const fromSvg = pathsOf(svg);
    const inComponent = [...tsx.matchAll(/'(M[^']+)'/g)].map((m) => m[1]);
    for (const d of fromSvg) {
      expect(inComponent, `a path in the master is missing from SunMascot.tsx`).toContain(d);
    }
    expect(inComponent).toHaveLength(fromSvg.length);
  });

  it('keeps the licence note that the artwork is not ours', () => {
    expect(tsx).toMatch(/fluentui-emoji/);
    expect(svg).toMatch(/fluentui-emoji/);
  });
});
