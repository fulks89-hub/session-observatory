import { spawn } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import type { Session } from './types.ts';
import type { Store } from './store.ts';
import { cleanText } from './normalize.ts';
export type CommandRecord = {
  id: string;
  sessionId: string;
  text: string;
  at: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  response: string;
  detail: string;
};
export type CommandCapability = {
  available: boolean;
  reason: string;
  route: string;
  executable?: string;
};
export type Launch = (
  args: string[],
  cwd: string,
  prompt: string,
  onEvent: (event: any) => void,
  onEnd: (ok: boolean) => void,
) => () => void;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function codexBinary(): string | null {
  const configured = process.env.OBS_CODEX_BIN;
  const candidates = configured
    ? [configured]
    : (process.env.PATH ?? '')
        .split(delimiter)
        .filter(Boolean)
        .map((p) => join(p, 'codex'));
  for (const path of candidates)
    try {
      if (isAbsolute(path) && statSync(path).isFile()) {
        accessSync(path, constants.X_OK);
        return path;
      }
    } catch {}
  return null;
}
export function commandCapability(s: Session, binary: string | null): CommandCapability {
  const base = { available: false, route: 'Codex CLI · existing conversation · read-only' };
  if (s.provenance === 'demo') return { ...base, reason: 'Demo preview only. No command is sent.' };
  if (s.provider !== 'codex')
    return {
      ...base,
      route: 'Native app',
      reason:
        'Direct sending is not connected for this provider. Copy your draft into the original chat.',
    };
  if (!binary)
    return {
      ...base,
      reason: 'Codex CLI is unavailable. Start with codex on PATH or configure OBS_CODEX_BIN.',
    };
  if (!uuid.test(s.sourceId) || !isAbsolute(s.cwd) || !s.sourcePath)
    return {
      ...base,
      reason: 'This history lacks a verified UUID or an absolute project directory.',
    };
  try {
    if (!statSync(s.cwd).isDirectory()) throw Error();
  } catch {
    return { ...base, reason: 'The recorded project directory is unavailable.' };
  }
  if (['working', 'waiting_input', 'waiting_approval'].includes(s.runtime))
    return {
      ...base,
      reason:
        'Finish or stop the native turn first. Live prompts and permission requests must be answered in the original app.',
    };
  return {
    ...base,
    available: true,
    executable: binary,
    reason:
      'Resumes this conversation through your signed-in Codex CLI. It is not live typing into the desktop window. Uses the Codex read-only sandbox; existing hooks and rules remain in effect. Provider usage applies.',
  };
}
export class Commands {
  store: Store;
  binary: string | null;
  launch: Launch;
  active = new Map<string, () => void>();
  constructor(store: Store, options: { binary?: string | null; launch?: Launch } = {}) {
    this.store = store;
    this.binary = options.binary === undefined ? codexBinary() : options.binary;
    store.db.exec(
      'CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY, session_id TEXT NOT NULL, data TEXT NOT NULL)',
    );
    for (const r of this.list())
      if (r.status === 'running')
        this.save({
          ...r,
          status: 'interrupted',
          detail:
            'Server restarted. Delivery is uncertain; check the native history before resending.',
        });
    this.launch =
      options.launch ??
      ((args, cwd, prompt, onEvent, onEnd) => {
        const env = { ...process.env };
        for (const k of Object.keys(env)) if (k.startsWith('OBS_MODEL_')) delete env[k];
        const child = spawn(this.binary!, args, {
          cwd,
          env,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        });
        let buffer = '',
          ended = false;
        const finish = (ok: boolean) => {
          if (!ended) {
            ended = true;
            onEnd(ok);
          }
        };
        child.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          if (buffer.length > 1_048_576) buffer = '';
          let end;
          while ((end = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, end);
            buffer = buffer.slice(end + 1);
            try {
              onEvent(JSON.parse(line));
            } catch {}
          }
        });
        child.stderr.resume(); // Never expose provider stderr or credentials in API responses.
        child.on('error', () => finish(false));
        child.on('close', (code) => finish(code === 0));
        child.stdin.on('error', () => {});
        child.stdin.end(prompt);
        return () => {
          try {
            if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
            else child.kill('SIGTERM');
          } catch {}
        };
      });
  }
  list(sessionId?: string): CommandRecord[] {
    return this.store.db
      .prepare(
        sessionId
          ? 'SELECT data FROM commands WHERE session_id=? ORDER BY rowid DESC LIMIT 20'
          : 'SELECT data FROM commands ORDER BY rowid DESC',
      )
      .all(...(sessionId ? [sessionId] : []))
      .map((r) => JSON.parse(String(r.data)));
  }
  save(r: CommandRecord) {
    this.store.db
      .prepare('INSERT OR REPLACE INTO commands VALUES (?,?,?)')
      .run(r.id, r.sessionId, JSON.stringify(r));
  }
  send(
    session: Session,
    input: {
      text?: unknown;
      requestId?: unknown;
      confirmed?: unknown;
      expectedUpdatedAt?: unknown;
    },
  ) {
    if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 8000)
      throw Error('Enter a follow-up of 1–8,000 characters.');
    if (typeof input.requestId !== 'string' || !uuid.test(input.requestId))
      throw Error('Invalid request ID.');
    const prior = this.store.db
      .prepare('SELECT data FROM commands WHERE id=?')
      .get(input.requestId);
    if (prior) {
      const saved = JSON.parse(String(prior.data)) as CommandRecord;
      if (saved.sessionId !== session.id || saved.text !== input.text.trim())
        throw Error('Request ID belongs to a different command.');
      return saved;
    }
    if (input.confirmed !== true)
      throw Error('Confirm the destination and that the native conversation is idle.');
    if (input.expectedUpdatedAt !== session.updatedAt)
      throw Error('The session changed. Reopen it before sending.');
    const capability = commandCapability(session, this.binary);
    if (!capability.available) throw Error(capability.reason);
    if (this.active.has(session.id))
      throw Error('A follow-up is already running for this session.');
    const r: CommandRecord = {
      id: input.requestId,
      sessionId: session.id,
      text: input.text.trim(),
      at: new Date().toISOString(),
      status: 'running',
      response: '',
      detail: 'Sending through Codex CLI; awaiting session acknowledgment.',
    };
    this.save(r);
    let acknowledged = false,
      completed = false,
      mismatch = false;
    let cancel = () => {};
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this.active.delete(session.id);
      r.status = ok && acknowledged && completed && !mismatch ? 'completed' : 'failed';
      r.detail =
        r.status === 'completed'
          ? 'Codex reported turn completion in the selected conversation. Native-window refresh is not verified.'
          : 'Completion was not confirmed. Check the native history before retrying; the prompt may have been delivered.';
      this.save(r);
    };
    const timer = setTimeout(() => {
      cancel();
      finish(false);
    }, 10 * 60_000);
    timer.unref();
    this.active.set(session.id, () => {
      cancel();
      finish(false);
    });
    try {
      cancel = this.launch(
        ['exec', '--sandbox', 'read-only', '--json', 'resume', session.sourceId, '-'],
        session.cwd,
        r.text,
        (event) => {
          if (event?.type === 'thread.started') {
            acknowledged = event.thread_id === session.sourceId;
            if (!acknowledged) {
              mismatch = true;
              cancel();
              finish(false);
            }
          }
          if (mismatch || settled) return;
          if (
            event?.type === 'item.completed' &&
            event.item?.type === 'agent_message' &&
            typeof event.item.text === 'string'
          )
            r.response = cleanText(event.item.text).slice(0, 12000);
          if (event?.type === 'turn.completed') completed = true;
          if (event?.type === 'turn.failed' || event?.type === 'error') completed = false;
          this.save(r);
        },
        finish,
      );
    } catch {
      finish(false);
    }
    return r;
  }
  close() {
    for (const cancel of [...this.active.values()]) cancel();
  }
}
