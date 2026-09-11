import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcriptTelemetry } from '../src/telemetry.ts';
import { sessionAttention } from '../src/attention.ts';
import { normalizeHook } from '../src/normalize.ts';
const lines = (r: unknown[]) => r.map((x) => JSON.stringify(x)).join('\n');
test('Codex cumulative usage is not summed across snapshots; cached and reasoning are not added twice', () => {
  const r = transcriptTelemetry(
    'codex',
    lines(
      [100, 200, 200].map((total) => ({
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: total - 20,
              output_tokens: 20,
              total_tokens: total,
              cached_input_tokens: 70,
              reasoning_output_tokens: 12,
            },
          },
        },
      })),
    ),
  );
  assert.equal(r.usage?.total, 200);
  assert.equal(r.usage?.cached, 70);
  assert.equal(r.usage?.output, 20);
});
test('Claude repeated message usage merges partial records and separates cache write from read', () => {
  const r = transcriptTelemetry(
    'claude',
    lines([
      {
        type: 'assistant',
        message: {
          id: 'm1',
          usage: {
            input_tokens: 10,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 30,
            output_tokens: 2,
          },
        },
      },
      { type: 'assistant', message: { id: 'm1', usage: { input_tokens: 10, output_tokens: 8 } } },
      { type: 'assistant', message: { id: 'm2', usage: { input_tokens: 5, output_tokens: 1 } } },
    ]),
  );
  assert.equal(r.usage?.total, 74);
  assert.equal(r.usage?.input, 65);
  assert.equal(r.usage?.cached, 20);
  assert.equal(r.usage?.records, 2);
});
test('missing telemetry remains unknown; tool references do not become confirmed invocations', () => {
  assert.equal(transcriptTelemetry('cursor', 'user:\nBuild').usage, null);
  const r = transcriptTelemetry(
    'claude',
    lines([
      { type: 'user', message: { content: 'Use all skills including fake/SKILL.md' } },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'html-report' } },
            {
              type: 'tool_use',
              id: 'b',
              name: 'Read',
              input: { file_path: '/skills/check/SKILL.md' },
            },
          ],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'a', name: 'Skill', input: { skill: 'html-report' } }],
        },
      },
    ]),
    true,
  );
  assert.equal(r.skills.length, 2);
  assert.equal(r.skills[0].kind, 'invocation');
  assert.equal(r.skills[0].count, 1);
  assert.equal(r.skills[1].kind, 'reference');
  assert.equal(r.partial, true);
});
test('waiting flags survive as explicitly stale evidence, while ordinary notifications do not create a reply request', () => {
  const s = normalizeHook('claude', { session_id: 'one', event: 'PermissionRequest' });
  assert.equal(sessionAttention(s)?.kind, 'approval');
  assert.equal(
    sessionAttention(s, Date.parse(s.updatedAt) + 700000)?.label,
    'Last seen waiting on you',
  );
  const info = normalizeHook(
    'claude',
    { session_id: 'one', event: 'Notification', notification_type: 'auth_success' },
    { ...s, runtime: 'idle' },
  );
  assert.equal(info.runtime, 'idle');
  assert.equal(sessionAttention(info), null);
  const guess = { ...info, latest: 'Please choose the next option.' };
  assert.equal(sessionAttention(guess)?.confirmed, false);
});
