import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from '../src/store.ts';
import { Commands, commandCapability } from '../src/commands.ts';
import { normalizeHook } from '../src/normalize.ts';
const session = () => ({
  ...normalizeHook('codex', {
    session_id: randomUUID(),
    event: 'Stop',
    cwd: tmpdir(),
    last_assistant_message: 'Done',
  }),
  sourcePath: '/fixture/history.jsonl',
});
test('commands need explicit approval, current session evidence and an idle compatible target', () => {
  const db = new Store(':memory:');
  let calls = 0;
  const service = new Commands(db, {
      binary: '/fixture/codex',
      launch: () => {
        calls++;
        return () => {};
      },
    }),
    s = session();
  const request = {
    text: 'Explain it',
    requestId: randomUUID(),
    expectedUpdatedAt: s.updatedAt,
    confirmed: true,
  };
  assert.throws(() => service.send(s, { ...request, confirmed: false }), /Confirm/);
  assert.throws(() => service.send(s, { ...request, expectedUpdatedAt: 'old' }), /changed/);
  for (const runtime of ['working', 'waiting_input', 'waiting_approval'] as const)
    assert.throws(() => service.send({ ...s, runtime }, request), /native turn/);
  assert.equal(commandCapability({ ...s, provider: 'cursor' }, '/fixture/codex').available, false);
  assert.equal(commandCapability({ ...s, provenance: 'demo' }, '/fixture/codex').available, false);
  assert.equal(calls, 0);
  service.close();
  db.close();
});
test('follow-ups use exact UUID and stdin with read-only sandbox; retries are idempotent and exit alone is not delivery proof', () => {
  const db = new Store(':memory:');
  const s = session();
  let calls = 0;
  let end = (ok: boolean) => {};
  let event = (e: any) => {};
  const service = new Commands(db, {
    binary: '/fixture/codex',
    launch: (args, cwd, prompt, onEvent, onEnd) => {
      calls++;
      assert.deepEqual(args, [
        'exec',
        '--sandbox',
        'read-only',
        '--json',
        'resume',
        s.sourceId,
        '-',
      ]);
      assert.equal(cwd, s.cwd);
      assert.equal(prompt, '$(do-not-execute)');
      end = onEnd;
      event = onEvent;
      return () => {};
    },
  });
  const request = {
    text: '$(do-not-execute)',
    requestId: randomUUID(),
    expectedUpdatedAt: s.updatedAt,
    confirmed: true,
  };
  service.send(s, request);
  service.send(s, request);
  assert.equal(calls, 1);
  assert.throws(() => service.send(s, { ...request, requestId: randomUUID() }), /already running/);
  end(true);
  assert.equal(service.list(s.id)[0].status, 'failed');
  const next = { ...request, requestId: randomUUID() };
  service.send(s, next);
  event({ type: 'thread.started', thread_id: s.sourceId });
  event({ type: 'item.completed', item: { type: 'agent_message', text: 'Explained' } });
  event({ type: 'turn.completed' });
  end(true);
  assert.equal(service.list(s.id)[0].status, 'completed');
  assert.equal(service.list(s.id)[0].response, 'Explained');
  service.close();
  db.close();
});
test('wrong conversation acknowledgment fails closed', () => {
  const db = new Store(':memory:');
  const s = session();
  let event = (e: any) => {};
  let canceled = false;
  const service = new Commands(db, {
    binary: '/fixture/codex',
    launch: (_a, _c, _p, onEvent) => {
      event = onEvent;
      return () => {
        canceled = true;
      };
    },
  });
  service.send(s, {
    text: 'Hello',
    requestId: randomUUID(),
    expectedUpdatedAt: s.updatedAt,
    confirmed: true,
  });
  event({ type: 'thread.started', thread_id: randomUUID() });
  assert.equal(canceled, true);
  assert.equal(service.list(s.id)[0].status, 'failed');
  service.close();
  db.close();
});

test('the real process adapter sends literal stdin and records an acknowledged response without a provider', async () => {
  const root = mkdtempSync(join(tmpdir(), 'switchboard-command-'));
  const binary = join(root, 'fake-codex');
  const db = new Store(':memory:');
  const s = session();
  writeFileSync(
    binary,
    `#!/usr/bin/env node
const args=process.argv.slice(2);let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>{if(JSON.stringify(args.slice(0,5))!==JSON.stringify(['exec','--sandbox','read-only','--json','resume']))process.exit(2);for(const event of [{type:'thread.started',thread_id:args[5]},{type:'item.completed',item:{type:'agent_message',text}},{type:'turn.completed'}])console.log(JSON.stringify(event));});
`,
    { mode: 0o700 },
  );
  const service = new Commands(db, { binary });
  try {
    const text = 'Literal $(echo untouched) and `backticks`';
    service.send(s, {
      text,
      requestId: randomUUID(),
      expectedUpdatedAt: s.updatedAt,
      confirmed: true,
    });
    await new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (!service.active.size) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(Error('Fixture timeout'));
        }
      }, 20);
    });
    assert.equal(service.list(s.id)[0].status, 'completed');
    assert.equal(service.list(s.id)[0].response, text);
  } finally {
    service.close();
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
