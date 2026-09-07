import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTranscript,
  normalizeHook,
  effectiveRuntime,
  correctionSignals,
} from '../src/normalize.ts';
import { Store } from '../src/store.ts';
import { nativeThreadHref } from '../src/navigation.ts';
const at = '2026-09-07T10:00:00Z';
const lines = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join('\n');
test('Codex separates completed turns from accepted work, preserves explicit tasks and session identity', () => {
  const s = parseTranscript(
    'codex',
    lines([
      { type: 'session_meta', payload: { id: 'abc-1', cwd: '/work/report' } },
      { type: 'event_msg', payload: { type: 'task_started' } },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Build a report' }],
        },
      },
      {
        type: 'event_msg',
        payload: { type: 'agent_message', message: '- [x] Read data\n- [ ] Review charts' },
      },
      { type: 'event_msg', payload: { type: 'task_complete' } },
    ]),
    '/logs/rollout.jsonl',
    at,
  )!;
  assert.equal(s.id, 'codex:abc-1');
  assert.equal(s.runtime, 'idle');
  assert.equal(s.acceptedAt, undefined);
  assert.equal(s.tasks[1].state, 'pending');
});
test('Claude and Cursor history formats extract text without tool results', () => {
  const c = parseTranscript(
    'claude',
    lines([
      { type: 'user', sessionId: 'claude-1', message: { content: 'Fix tables' } },
      {
        type: 'assistant',
        message: {
          model: 'sonnet',
          stop_reason: 'end_turn',
          content: [
            { type: 'tool_use', name: 'Bash', input: 'private' },
            { type: 'text', text: 'Fixed table layout' },
          ],
        },
      },
    ]),
    '/logs/a.jsonl',
    at,
  )!;
  assert.equal(c.latest, 'Fixed table layout');
  assert.equal(c.runtime, 'idle');
  const u = parseTranscript(
    'cursor',
    lines([
      { role: 'user', message: { content: [{ type: 'text', text: 'Fix layout' }] } },
      { type: 'turn_ended', status: 'completed' },
    ]),
    '/logs/cursor-1.jsonl',
    at,
  )!;
  assert.equal(u.sourceId, 'cursor-1');
  assert.equal(u.runtime, 'idle');
});
test('bad tail JSON is ignored; stale activity never masquerades as active', () => {
  const s = normalizeHook('cursor', {
    conversation_id: 'one',
    event: 'beforeSubmitPrompt',
    prompt: 'Build',
  });
  s.updatedAt = at;
  assert.equal(effectiveRuntime(s, Date.parse(at) + 700_000), 'stale');
  assert.throws(() => normalizeHook('codex', { session_id: '../../bad', event: 'Stop' }));
  assert.equal(parseTranscript('codex', '{broken', 'a.jsonl', at), null);
});
test('rescan preserves human review and does not erase newer hook status', () => {
  const store = new Store(':memory:');
  const s = normalizeHook('codex', {
    session_id: 'one',
    event: 'UserPromptSubmit',
    prompt: 'Report',
  });
  store.save(s);
  store.patch(s.id, { reviewedAt: at, pinnedGoal: 'My goal' });
  store.save({ ...s, updatedAt: at, provenance: 'history', runtime: 'idle' });
  assert.equal(store.get(s.id)?.pinnedGoal, 'My goal');
  assert.equal(store.get(s.id)?.runtime, 'working');
  store.close();
});
test('opportunities require explicit feedback and retain cross-session evidence', () => {
  const db = new Store(':memory:');
  for (const id of ['a', 'b'])
    db.save(normalizeHook('codex', { session_id: id, event: 'UserPromptSubmit', prompt: 'HTML' }));
  assert.equal(db.opportunities(false).length, 0);
  db.correction('codex:a', 'Layout', 'Table overflow', 'html-v1');
  db.correction('codex:b', 'Layout', 'Table overflow again', 'html-v1');
  assert.equal(db.opportunities(false)[0].sessions, 2);
  db.close();
});
test('structured plan events preserve in-progress state without executing tool input', () => {
  const s = parseTranscript(
    'codex',
    lines([
      { type: 'event_msg', payload: { type: 'user_message', message: 'Build app' } },
      {
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'update_plan',
          arguments: JSON.stringify({
            plan: [
              { step: 'Build UI', status: 'in_progress' },
              { step: 'Verify', status: 'pending' },
            ],
          }),
        },
      },
    ]),
    '/logs/one.jsonl',
    at,
  )!;
  assert.equal(s.tasks[0].state, 'in_progress');
});
test('correction suggestions do not treat ordinary initial requirements as failures', () => {
  const s = normalizeHook('codex', {
    session_id: 'feedback',
    event: 'UserPromptSubmit',
    prompt: 'Fix the layout',
  });
  assert.equal(correctionSignals([s]).length, 0);
  s.messages.push({
    role: 'user',
    text: 'The table still has overflow on mobile.',
    at,
    id: 'followup',
  });
  assert.equal(correctionSignals([s])[0].category, 'Layout');
  assert.equal(correctionSignals([s])[0].skill, null);
});
test('a truncated rescan cannot replace a newer cached update with an old head excerpt', () => {
  const db = new Store(':memory:');
  const session = normalizeHook('codex', {
    session_id: 'large',
    event: 'Stop',
    last_assistant_message: 'The current update',
  });
  session.provenance = 'history';
  db.save(session);
  db.save({
    ...session,
    truncated: true,
    latest: 'An old update',
    updatedAt: at,
    messages: [{ role: 'assistant', text: 'An old update', at, id: 'old' }],
  });
  assert.equal(db.get(session.id)?.latest, 'The current update');
  assert.equal(db.get(session.id)?.updatedAt, session.updatedAt);
  db.close();
});
test('native links cannot select reserved routes or another application from transcript input', () => {
  for (const sourceId of ['new', '..', 'settings', 'https://example.com', 'one?prompt=execute'])
    assert.equal(nativeThreadHref({ sourceId, provider: 'codex', provenance: 'history' }), null);
  assert.equal(
    nativeThreadHref({
      sourceId: '12345678-1234-1234-1234-123456789abc',
      provider: 'codex',
      provenance: 'history',
    }),
    'codex://threads/12345678-1234-1234-1234-123456789abc',
  );
});
