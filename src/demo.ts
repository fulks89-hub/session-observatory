import { Store } from './store.ts';
import { tasksFrom } from './normalize.ts';
import type { Session, SkillSuite, Check } from './types.ts';
export function seedDemo(db: Store) {
  if (db.setting('demoSeeded', false)) return;
  const specs: Partial<Session>[] = [
    {
      sourceId: 'demo-report',
      provider: 'claude',
      title: 'Executive report skill',
      project: 'Report studio',
      runtime: 'waiting_input',
      goal: 'Make our HTML report skill produce clear, accessible executive reports with fewer layout corrections.',
      latest:
        'The revised report is ready. The chart labels now wrap correctly. Please review the information hierarchy before I apply the same structure to the appendix.\n\n- [x] Repair chart labels\n- [x] Add print styles\n- [ ] Review report hierarchy',
      skill: 'html-report@v1',
    },
    {
      sourceId: 'demo-auth',
      provider: 'codex',
      title: 'Simplify the sign-in flow',
      project: 'Customer portal',
      runtime: 'working',
      goal: 'Remove the extra sign-in step while preserving session security and account switching.',
      latest:
        'Tracing the account-switch path. The session cookie checks pass; I am updating the return navigation.\n\n- [x] Reproduce account-switch issue\n- [ ] Update return navigation\n- [ ] Run regression checks',
    },
    {
      sourceId: 'demo-table',
      provider: 'cursor',
      title: 'Quarterly report template',
      project: 'Report studio',
      runtime: 'idle',
      goal: 'Generate the quarterly report using the HTML report skill, including a dense comparison table.',
      latest:
        'The comparison table now fits narrow screens. The report and HTML source are ready for review.\n\n- [x] Generate comparison table\n- [x] Fix narrow-screen overflow\n- [ ] Review generated report',
      skill: 'html-report@v1',
    },
    {
      sourceId: 'demo-migration',
      provider: 'codex',
      title: 'Migrate the project index',
      project: 'Knowledge tools',
      runtime: 'waiting_approval',
      goal: 'Move the project index to the new schema and preserve existing identifiers and links.',
      latest:
        'The dry run is complete. The migration changes 12 records. Waiting for approval before writing the updated index.\n\n- [x] Validate source records\n- [x] Run migration preview\n- [ ] Approve the write',
    },
    {
      sourceId: 'demo-tests',
      provider: 'claude',
      title: 'Investigate the export failure',
      project: 'Customer portal',
      runtime: 'error',
      goal: 'Identify why large exports fail and produce a regression case before changing the exporter.',
      latest:
        'The fixture reproduced the problem, but the test database is unavailable. Restore the local database before continuing.\n\n- [x] Reproduce the failure\n- [ ] Restore test database\n- [ ] Verify the fix',
    },
  ];
  for (let i = 0; i < specs.length; i++) {
    const p = specs[i],
      at = new Date(Date.now() - i * 60_000).toISOString();
    const s = {
      ...p,
      id: `${p.provider}:${p.sourceId}`,
      cwd: `/demo/${p.project}`,
      model: 'Example model',
      updatedAt: at,
      sourcePath: 'Synthetic example',
      truncated: false,
      provenance: 'demo',
      messages: [
        { role: 'user', text: p.goal, at, id: `user-${i}` },
        { role: 'assistant', text: p.latest, at, id: `assistant-${i}` },
      ],
      tasks: tasksFrom(p.latest!, `assistant-${i}`),
    } as Session;
    db.save(s);
    if (p.skill) db.patch(s.id, { skill: p.skill });
  }
  db.correction(
    'claude:demo-report',
    'Layout',
    'The chart labels still overflow at narrow widths.',
    'html-report@v1',
  );
  db.correction(
    'cursor:demo-table',
    'Layout',
    'The comparison table needed a second pass for narrow screens.',
    'html-report@v1',
  );
  db.set('demoSeeded', true);
}
export function exampleSuite(): SkillSuite {
  const checks: Check[] = [
    { id: 'title', label: 'Document title', kind: 'html_title', required: true },
    { id: 'lang', label: 'Document language', kind: 'html_lang', required: true },
    { id: 'viewport', label: 'Mobile viewport declaration', kind: 'viewport', required: true },
    {
      id: 'summary',
      label: 'Executive summary included',
      kind: 'contains',
      value: 'Executive summary',
      required: true,
    },
    { id: 'alt', label: 'Image alt attributes', kind: 'image_alt', required: true },
  ];
  const good = (name: string) =>
    `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>${name}</title><style>body{font:18px system-ui;max-width:60rem;margin:3rem auto;padding:0 1rem;color:#20352f}h1{font-size:2.5rem}section{padding:1rem;background:#edf3ef;border-radius:12px}</style></head><body><h1>${name}</h1><section><h2>Executive summary</h2><p>This is a synthetic evaluation artifact, not a report about a real company.</p></section></body></html>`;
  return {
    id: 'html-report-example',
    name: 'HTML report · sample suite',
    revision: 'example-v1',
    baseline: 'Create an HTML executive report from the supplied brief.',
    candidate:
      'Create a complete HTML document. Include a descriptive title, language attribute, a device-width viewport, and an Executive summary section. Give every image an alt attribute. Preserve supplied facts. Validate the document before returning it.',
    cases: [
      {
        id: 'standard-report',
        prompt: 'Create a short executive report about the fictional Acorn project.',
        split: 'train',
        checks,
        baselineOutput:
          '<html><body><h1>Acorn report</h1><p>Work is progressing.</p></body></html>',
        candidateOutput: good('Acorn project'),
      },
      {
        id: 'long-report',
        prompt: 'Create a report for the fictional Harbor project, with an appendix.',
        split: 'train',
        checks,
        baselineOutput:
          '<html><head><title>Harbor</title></head><body><h1>Harbor report</h1></body></html>',
        candidateOutput: good('Harbor project'),
      },
      {
        id: 'unseen-report',
        prompt: 'Create a report for the fictional Meadow project.',
        split: 'holdout',
        checks,
        baselineOutput: '<html><body><h1>Meadow</h1></body></html>',
        candidateOutput: good('Meadow project'),
      },
    ],
  };
}
