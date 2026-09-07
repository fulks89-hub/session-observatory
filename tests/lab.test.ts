import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkHtml,
  evaluateArtifacts,
  validateSuite,
  runModels,
  synthesizeSuite,
} from '../src/lab.ts';
import type { SkillSuite } from '../src/types.ts';
import { createServer } from 'node:http';
const suite = (): SkillSuite => ({
  id: 'html',
  name: 'HTML',
  baseline: 'original',
  candidate: 'candidate',
  revision: '1',
  cases: [
    {
      id: 'a',
      prompt: 'Report',
      split: 'train',
      checks: [{ id: 'title', label: 'Title', kind: 'html_title', required: true }],
      baselineOutput: '<title>Report</title>',
      candidateOutput: '<title>Improved</title>',
    },
    {
      id: 'b',
      prompt: 'Other report',
      split: 'holdout',
      checks: [{ id: 'title', label: 'Title', kind: 'html_title', required: true }],
    },
  ],
});
test('missing holdout evidence blocks eligibility, even if training passes', () => {
  const r = evaluateArtifacts(suite());
  assert.equal(r.eligible, false);
  assert.equal(r.results.find((x) => x.caseId === 'b' && x.variant === 'candidate')?.passed, false);
});
test('structural checks parse HTML instead of trusting a model claim', () => {
  const checks = checkHtml('<p>I have a title</p><img src=x>', [
    { id: 'title', label: 'Title', kind: 'html_title', required: true },
    { id: 'alt', label: 'Alt', kind: 'image_alt', required: true },
  ]);
  assert.ok(checks.every((c) => !c.pass));
});
test('regression gate rejects a candidate even if some cases improve', () => {
  const s = suite();
  s.cases[1].baselineOutput = '<title>Good</title>';
  s.cases[1].candidateOutput = '<p>bad</p>';
  const r = evaluateArtifacts(s);
  assert.equal(r.eligible, false);
  assert.ok(r.reasons.some((x) => x.includes('regress')));
});
test('invalid policy cannot silently remove holdout or make unknown checks pass', () => {
  const s = suite();
  s.cases[1].split = 'train';
  assert.throws(() => validateSuite(s));
  const t = suite();
  (t.cases[0].checks[0] as any).kind = 'trust_me';
  assert.throws(() => validateSuite(t));
});
test('evaluation refuses a batch above its call cap before contacting any endpoint', async () => {
  await assert.rejects(
    runModels(suite(), {
      kind: 'openai-compatible',
      endpoint: 'http://127.0.0.1:1',
      model: 'test',
      maxCalls: 1,
    }),
    /cap/,
  );
});
test('optimizer uses only training evidence, stops when it passes, and evaluates selected candidate on holdout once', async () => {
  const seen: any[] = [];
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    seen.push(body);
    const isProposal = body.messages[0].content.startsWith('Improve the supplied skill');
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          { message: { content: isProposal ? 'Improved skill' : '<title>Report</title>' } },
        ],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as any).port;
  try {
    const s = suite();
    s.cases[1].prompt = 'SECRET HOLDOUT REQUEST';
    const result = await runModels(
      s,
      {
        kind: 'openai-compatible',
        endpoint: `http://127.0.0.1:${port}`,
        model: 'fixture',
        maxCalls: 8,
      },
      () => {},
      true,
    );
    assert.equal(result.report.attempts, 1);
    assert.equal(result.report.calls, 5);
    const proposals = seen.filter((x) =>
      x.messages[0].content.startsWith('Improve the supplied skill'),
    );
    assert.equal(proposals.length, 1);
    assert.ok(!JSON.stringify(proposals).includes('SECRET HOLDOUT'));
    assert.equal(
      seen.filter(
        (x) =>
          x.messages[0].content === 'Improved skill' &&
          x.messages[1].content === 'SECRET HOLDOUT REQUEST',
      ).length,
      1,
    );
    assert.equal(s.baseline, 'original');
    assert.equal(s.candidate, 'candidate');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test('visible text checks do not pass because a script contains the requested words', () => {
  assert.equal(
    checkHtml('<script>"Executive summary"</script>', [
      {
        id: 'summary',
        label: 'Summary',
        kind: 'contains',
        value: 'Executive summary',
        required: true,
      },
    ])[0].pass,
    false,
  );
});
test('dataset validator rejects a task family shared between training and holdout', () => {
  const s = suite();
  s.cases[0].familyId = 'shared';
  s.cases[1].familyId = 'shared';
  assert.throws(() => validateSuite(s), /families/);
});
test('synthetic generation creates training-only variants and preserves the original suite', async () => {
  let sent = '';
  const server = createServer(async (req, res) => {
    for await (const chunk of req) sent += chunk;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify([
                'Report with a long appendix',
                'Report with an empty dataset',
              ]),
            },
          },
        ],
      }),
    );
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  try {
    const s = suite();
    s.cases[1].prompt = 'SECRET HOLDOUT';
    const next = await synthesizeSuite(s, {
      kind: 'openai-compatible',
      endpoint: `http://127.0.0.1:${(server.address() as any).port}`,
      model: 'fixture',
      maxCalls: 1,
    });
    assert.equal(next.cases.length, 4);
    assert.equal(s.cases.length, 2);
    assert.ok(!sent.includes('SECRET HOLDOUT'));
    assert.ok(
      next.cases.slice(2).every((c) => c.synthetic && c.split === 'train' && c.familyId === 'a'),
    );
    assert.deepEqual(next.cases[2].checks, s.cases[0].checks);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
