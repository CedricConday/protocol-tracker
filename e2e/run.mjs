// Runs every flow in e2e/flows against the running Expo web server and writes a
// machine-readable audit to e2e/report/. Nothing here fixes anything: the point
// is a report a reviewer can approve or reject, fix by fix.
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { openApp, BASE_URL } from './lib/session.mjs';

const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));

const files = (await readdir('e2e/flows')).filter((f) => f.endsWith('.mjs')).sort();
const flows = [];
for (const f of files) {
  const mod = await import(pathToFileURL(resolve('e2e/flows', f)).href);
  if (!only.length || only.includes(mod.default.name)) flows.push(mod.default);
}

const results = [];
for (const flow of flows) {
  process.stderr.write(`▶ ${flow.name}\n`);
  // A flow may ask for session tweaks (see `stubNotificationScheduler` in
  // session.mjs) by exporting a `session` object.
  const ctx = await openApp({ label: flow.name, ...(flow.session ?? {}) });
  let outcome = { flow: flow.name, description: flow.description, status: 'passed', findings: [], crash: null };
  try {
    const r = await flow.run(ctx);
    outcome.findings = r?.findings ?? [];
    outcome.endScreen = r?.endScreen;
  } catch (e) {
    outcome.status = 'crashed';
    outcome.crash = `${e.message}`.split('\n').slice(0, 6).join('\n');
    await ctx.shot('crash').catch(() => {});
  }
  // Runtime errors the page threw count as findings even when the flow itself
  // completed — a flow can walk right past a red console error.
  for (const e of ctx.errors) {
    outcome.findings.push({ summary: `Runtime ${e.kind}`, detail: e.text, notice: e.advisory === true });
  }

  // A finding that is not a defect must not decide pass/fail. Two kinds:
  // a dependency's own deprecation notice (session.mjs ADVISORY_CONSOLE), and a
  // flow's deliberate `NOTE (not a defect)` observation. Both stay in the
  // report — they are how the next reader learns what the build looked like —
  // but "failed" now means the flow found something wrong with the app.
  //
  // Before this, every flow reported failed on every run because two libraries
  // announce their deprecation at load, and the summary read 0/9 clean whatever
  // the app did.
  const isNotice = (f) => f.notice === true || /^NOTE\b/.test(f.summary || '');
  outcome.notices = outcome.findings.filter(isNotice);
  outcome.findings = outcome.findings.filter((f) => !isNotice(f));
  if (outcome.findings.length && outcome.status === 'passed') outcome.status = 'failed';
  outcome.shots = ctx.shots;
  results.push(outcome);
  await ctx.close();
}

await mkdir('e2e/report', { recursive: true });
const report = { baseUrl: BASE_URL, ranAt: new Date().toISOString(), results };
await writeFile('e2e/report/report.json', JSON.stringify(report, null, 2));

const md = [
  '# Protocol Tracker — e2e audit',
  '',
  `Target: ${BASE_URL}`,
  '',
  ...results.flatMap((r) => [
    `## ${r.flow} — **${r.status}**`,
    r.description ? `_${r.description}_` : '',
    r.crash ? `\nCrashed: \`${r.crash}\`` : '',
    ...(r.findings.length
      ? ['', ...r.findings.map((f) => `- **${f.summary}**${f.detail ? `\n  \`\`\`\n  ${String(f.detail).replace(/\n/g, '\n  ')}\n  \`\`\`` : ''}`)]
      : ['', 'No findings.']),
    ...(r.notices?.length
      ? ['', '<details><summary>' + r.notices.length + ' notice(s) — not defects, not counted</summary>', '',
         ...r.notices.map((f) => `- ${f.summary}${f.detail ? `\n  \`\`\`\n  ${String(f.detail).replace(/\n/g, '\n  ')}\n  \`\`\`` : ''}`),
         '', '</details>']
      : []),
    '',
    r.shots?.length ? `Screenshots: ${r.shots.join(', ')}` : '',
    '',
  ]),
].join('\n');
await writeFile('e2e/report/report.md', md);

const bad = results.filter((r) => r.status !== 'passed').length;
const defects = results.reduce((n, r) => n + r.findings.length, 0);
const notices = results.reduce((n, r) => n + (r.notices?.length ?? 0), 0);
process.stderr.write(`\n${results.length - bad}/${results.length} flows clean · ${defects} defect(s) · ${notices} notice(s), not counted → e2e/report/report.md\n`);
process.exit(bad ? 1 : 0);
