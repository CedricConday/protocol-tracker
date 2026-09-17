/**
 * What the share sheet hands to the OS.
 *
 * On 2026-09-17 the JSON backup went out as a `data:` URI and Android refused
 * it: ExpoSharing vends files through a FileProvider, so anything but `file://`
 * is rejected at the native boundary — invisible to `tsc`, invisible to the web
 * build, and visible only on a phone. This asserts the scheme per platform, so
 * the next person to touch `send.ts` finds out here instead of there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const shareAsync = vi.fn();
const written: { name: string; content: string }[] = [];

vi.mock('react-native', () => ({ NativeModules: {}, Platform: { OS: 'ios' } }));
vi.mock('expo-sharing', () => ({ shareAsync: (...a: any[]) => shareAsync(...a) }));
vi.mock('expo-print', () => ({ printToFileAsync: vi.fn(async () => ({ uri: 'file:///tmp/report.pdf' })) }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: { uri: 'file:///cache/' } },
  File: class {
    uri: string;
    exists = false;
    constructor(_dir: unknown, public name: string) { this.uri = `file:///cache/${name}`; }
    create() {}
    delete() {}
    write(content: string) { written.push({ name: this.name, content }); }
  },
}));
vi.mock('../../i18n', () => ({ t: (k: string) => k, locale: () => 'en' }));
vi.mock('../data', () => ({ collectShareData: vi.fn(async () => ({ from: '2026-09-01', to: '2026-09-30' })) }));
vi.mock('../shape', () => ({ bundleToJson: () => '{"doses":[]}' }));
vi.mock('../report', () => ({ buildShareHtml: () => '<html></html>' }));

import { shareFromConfig } from '../send';
import { DEFAULT_SECTIONS } from '../types';

const config = (format: 'json' | 'pdf') => ({
  preset: 'all' as const,
  from: '2026-09-01',
  to: '2026-09-30',
  sections: DEFAULT_SECTIONS,
  format,
});

describe('what leaves the app', () => {
  beforeEach(() => { shareAsync.mockClear(); written.length = 0; });

  it('hands the JSON backup to the OS as a real file, never a data: URI', async () => {
    await shareFromConfig(config('json'));
    const [uri, opts] = shareAsync.mock.calls[0];
    expect(uri.startsWith('file://')).toBe(true);
    expect(uri.startsWith('data:')).toBe(false);
    expect(opts.mimeType).toBe('application/json');
  });

  it('names the file after the range, so a doctor sees what it holds', async () => {
    await shareFromConfig(config('json'));
    expect(written[0].name).toBe('protocol-tracker-2026-09-01_2026-09-30.json');
    expect(written[0].content).toBe('{"doses":[]}');
  });

  it('still sends the PDF as the file expo-print produced', async () => {
    await shareFromConfig(config('pdf'));
    const [uri, opts] = shareAsync.mock.calls[0];
    expect(uri).toBe('file:///tmp/report.pdf');
    expect(opts.mimeType).toBe('application/pdf');
  });
});
