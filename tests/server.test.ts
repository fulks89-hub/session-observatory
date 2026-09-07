import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server.ts';
import { Collector } from '../src/collector.ts';
import { Store } from '../src/store.ts';
import { hookConfiguration } from '../src/cli.ts';
import { request } from 'node:http';
test('local app rejects unauthenticated, cross-origin, and unknown-host API calls; complete review + lab flow works', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'session-observatory-test-'));
  const app = await createApp({ dataDir: dir, port: 0, modelConfig: null });
  try {
    assert.equal((await fetch(app.origin + '/api/state')).status, 401);
    const home = await fetch(app.origin);
    assert.equal(home.status, 200);
    const cookie = home.headers.get('set-cookie')!.split(';')[0];
    const get = async (path: string) =>
      (await fetch(app.origin + path, { headers: { Cookie: cookie } })).json();
    const post = async (path: string, data: unknown, origin = app.origin) =>
      fetch(app.origin + path, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    assert.equal(
      (await post('/api/evaluate', { suiteId: 'html-report-example' }, 'https://untrusted.example'))
        .status,
      403,
    );
    const badHost = await new Promise<number>((resolve) => {
      request(
        app.origin + '/api/state',
        { headers: { Cookie: cookie, Host: 'untrusted.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode!);
        },
      ).end();
    });
    assert.equal(badHost, 403);
    const state: any = await get('/api/state?demo=1');
    assert.equal(state.sessions.length, 5);
    assert.equal(state.connections.filter((c: any) => c.enabled).length, 0);
    assert.equal(
      (await post('/api/session', { id: 'cursor:demo-table', action: 'review' })).status,
      200,
    );
    const detail: any = await get('/api/session/cursor%3Ademo-table');
    assert.ok(detail.reviewedAt);
    assert.equal(
      (await post('/api/session', { id: 'codex:demo-auth', action: 'accept' })).status,
      400,
    );
    const report: any = await (
      await post('/api/evaluate', { suiteId: 'html-report-example' })
    ).json();
    assert.equal(report.eligible, true);
    assert.equal(report.calls, 0);
    assert.equal(report.results.filter((r: any) => r.variant === 'baseline' && r.passed).length, 0);
    assert.equal(
      report.results.filter((r: any) => r.variant === 'candidate' && r.passed).length,
      3,
    );
    assert.equal(
      (await post('/api/model-run', { suiteId: 'html-report-example', approved: true })).status,
      400,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('collector reads only enabled transcript sources, recovers after restart, and never treats skills as sessions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'session-observatory-collector-'));
  const root = join(dir, 'codex');
  await mkdir(root);
  await writeFile(
    join(root, 'one.jsonl'),
    JSON.stringify({ type: 'session_meta', payload: { id: 'one', cwd: '/project' } }) +
      '\n' +
      JSON.stringify({
        type: 'event_msg',
        payload: { type: 'user_message', message: 'Build a report' },
      }) +
      '\n',
  );
  const db = new Store(join(dir, 'test.sqlite'));
  const collector = new Collector(db, dir, { codex: [root], claude: [], cursor: [] });
  try {
    await collector.scan();
    assert.equal(db.sessions(false).length, 0);
    db.set('enabled:codex', true);
    await collector.scan();
    assert.equal(db.sessions(false)[0].goal, 'Build a report');
    db.patch('codex:one', { pinnedGoal: 'Pinned' });
    const other = new Collector(db, dir, { codex: [root], claude: [], cursor: [] });
    await other.scan();
    assert.equal(db.get('codex:one')?.pinnedGoal, 'Pinned');
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('hook config quotes paths with spaces and apostrophes and installs nothing', () => {
  const s = JSON.stringify(
    hookConfiguration('claude', '/node path/node', "/work/it's a folder", '/data'),
  );
  assert.ok(s.includes('hook.mjs'));
  assert.ok(s.includes('PermissionRequest'));
  assert.ok(!s.includes('approve'));
});
