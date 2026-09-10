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
    outcome.findings.push({ summary: `Runtime ${e.kind}`, detail: e.text });
  }
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
    '',
    r.shots?.length ? `Screenshots: ${r.shots.join(', ')}` : '',
    '',
  ]),
].join('\n');
await writeFile('e2e/report/report.md', md);

const bad = results.filter((r) => r.status !== 'passed').length;
process.stderr.write(`\n${results.length - bad}/${results.length} flows clean → e2e/report/report.md\n`);
process.exit(bad ? 1 : 0);
