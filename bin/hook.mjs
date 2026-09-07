#!/usr/bin/env node
// Observer only: no stdout, no permission decisions, no execution of payload text.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
const [provider, eventName, dataRoot] = process.argv.slice(2);
const deadline = setTimeout(() => process.exit(0), 800);
deadline.unref();
try {
  if (!['codex', 'claude', 'cursor'].includes(provider)) process.exit(0);
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 128 * 1024) process.exit(0);
  }
  const raw = JSON.parse(input);
  const event = { hook_event_name: eventName };
  for (const key of [
    'session_id',
    'conversation_id',
    'cwd',
    'workspace_roots',
    'model',
    'notification_type',
    'prompt',
    'last_assistant_message',
  ])
    if (raw[key] !== undefined) event[key] = raw[key];
  const dir = join(
    dataRoot || process.env.OBSERVATORY_DATA_DIR || join(homedir(), '.session-observatory'),
    'inbox',
  );
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const id = randomUUID(),
    temporary = join(dir, `${id}.tmp`);
  await writeFile(temporary, JSON.stringify({ provider, event }), { mode: 0o600, flag: 'wx' });
  await rename(temporary, join(dir, `${id}.json`));
} catch {
  /* Monitoring must never block the user's agent. */
}
clearTimeout(deadline);
