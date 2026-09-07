import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import type { Message, Provider, Runtime, Session, Task } from './types.ts';
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const safeId = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(value);
export function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((x) => x && ['text', 'input_text', 'output_text'].includes(x.type))
    .map((x) => x.text ?? '')
    .join('\n');
}
export function cleanText(text: string): string {
  return text
    .replace(
      /<(?:environment_context|system-reminder|INSTRUCTIONS|recommended_plugins|user_instructions)\b[^>]*>[\s\S]*?<\/(?:environment_context|system-reminder|INSTRUCTIONS|recommended_plugins|user_instructions)>/gi,
      '',
    )
    .replace(/<[^>]+>/g, '')
    .replace(/\b(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,})\b/g, '[redacted token]')
    .trim()
    .slice(0, 14000);
}
export function tasksFrom(text: string, evidence: string): Task[] {
  return [...text.matchAll(/^\s*[-*]\s+\[([ xX])\]\s+(.+)$/gm)]
    .slice(0, 30)
    .map((m) => ({
      text: m[2].slice(0, 300),
      state: m[1].trim() ? 'completed' : 'pending',
      evidence,
    }));
}
export function parseTranscript(
  provider: Provider,
  text: string,
  sourcePath: string,
  modifiedAt: string,
  truncated = false,
): Session | null {
  let sourceId = basename(sourcePath).replace(/\.(jsonl|txt)$/, '');
  let cwd = '',
    model = '',
    runtime: Runtime = 'stale',
    lastAt = modifiedAt;
  let goal = '',
    latest = '';
  const messages: Message[] = [];
  let tasks: Task[] = [];
  const readPlan = (input: any, id: string) => {
    const plan = input?.plan ?? input?.todos;
    if (!Array.isArray(plan)) return;
    const next = plan
      .filter((x) => x && typeof (x.step ?? x.content) === 'string')
      .slice(0, 30)
      .map((x) => ({
        text: String(x.step ?? x.content).slice(0, 300),
        state: (x.status === 'completed'
          ? 'completed'
          : x.status === 'in_progress'
            ? 'in_progress'
            : 'pending') as Task['state'],
        evidence: id,
      }));
    if (next.length) tasks = next;
  };
  const add = (role: unknown, raw: string, at: string, id: string) => {
    if (role !== 'user' && role !== 'assistant') return;
    const value = cleanText(raw);
    if (!value || value.startsWith('# AGENTS.md instructions')) return;
    if (messages.at(-1)?.text === value && messages.at(-1)?.role === role) return;
    if (role === 'user' && !goal) goal = value;
    if (role === 'assistant') {
      latest = value;
      const nextTasks = tasksFrom(value, id);
      if (nextTasks.length) tasks = nextTasks;
    }
    messages.push({ role, text: value, at, id });
    if (messages.length > 50) messages.shift();
  };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let row: any;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const p = row.payload ?? {};
    const rawAt = row.timestamp ?? p.timestamp;
    const at =
      typeof rawAt === 'string' && Number.isFinite(Date.parse(rawAt))
        ? new Date(rawAt).toISOString()
        : modifiedAt;
    lastAt = at;
    const id = String(row.uuid ?? row.id ?? hash(`${sourcePath}:${i}:${lines[i]}`).slice(0, 20));
    if (provider === 'codex') {
      if (row.type === 'session_meta') {
        sourceId = p.id ?? p.session_id ?? sourceId;
        cwd = p.cwd ?? '';
      }
      if (row.type === 'turn_context') model = p.model ?? model;
      if (row.type === 'event_msg') {
        if (['task_started', 'turn_started'].includes(p.type)) runtime = 'working';
        if (['task_complete', 'task_completed', 'turn_complete'].includes(p.type)) runtime = 'idle';
        if (['turn_aborted', 'task_interrupted'].includes(p.type)) runtime = 'interrupted';
        if (p.type === 'error') runtime = 'error';
        if (p.type === 'user_message') add('user', p.message ?? '', at, id);
        if (p.type === 'agent_message') add('assistant', p.message ?? '', at, id);
      }
      if (row.type === 'response_item' && p.type === 'message')
        add(p.role, contentText(p.content), at, id);
      if (
        row.type === 'response_item' &&
        ['function_call', 'custom_tool_call'].includes(p.type) &&
        /(^|\.)update_plan$/.test(p.name ?? '')
      ) {
        try {
          readPlan(JSON.parse(p.arguments ?? p.input ?? '{}'), id);
        } catch {}
      }
      if (row.type === 'event_msg' && p.type === 'plan_updated') readPlan(p, id);
    } else {
      sourceId = row.sessionId ?? sourceId;
      cwd = row.cwd ?? cwd;
      model = row.message?.model ?? model;
      const role = row.role ?? row.type;
      add(role, contentText(row.message?.content ?? row.content), at, id);
      if (provider === 'claude' && Array.isArray(row.message?.content))
        for (const block of row.message.content)
          if (block.type === 'tool_use' && block.name === 'TodoWrite') readPlan(block.input, id);
      if (provider === 'claude' && role === 'assistant')
        runtime = row.message?.stop_reason === 'end_turn' ? 'idle' : 'working';
      if (role === 'user') runtime = 'working';
      if (row.type === 'turn_ended') runtime = row.status === 'error' ? 'error' : 'idle';
    }
  }
  if (!messages.length && provider === 'cursor' && sourcePath.endsWith('.txt')) {
    for (const m of text.matchAll(
      /(?:^|\n)(user|assistant):\s*\n([\s\S]*?)(?=\n(?:user|assistant):|$)/g,
    ))
      add(m[1], m[2], modifiedAt, hash(m[0]).slice(0, 20));
  }
  if (!goal && !latest) return null;
  if (!safeId(sourceId)) return null;
  if (!cwd && provider === 'cursor') {
    const match = sourcePath.match(/\/projects\/([^/]+)\/agent-transcripts\//);
    cwd = match?.[1] ?? '';
  }
  return {
    id: `${provider}:${sourceId}`,
    sourceId,
    provider,
    title:
      (goal || latest)
        .split('\n')
        .find((l) => l.trim())
        ?.slice(0, 100) || 'Untitled session',
    goal: goal.slice(0, 700),
    latest: latest.slice(0, 1200),
    cwd,
    project: basename(cwd) || 'Unassigned',
    model: model || 'Not recorded',
    runtime,
    updatedAt: lastAt,
    sourcePath,
    messages,
    tasks,
    truncated,
    provenance: 'history',
  };
}
export function effectiveRuntime(session: Session, now = Date.now()): Runtime {
  if (
    session.provenance !== 'demo' &&
    ['working', 'waiting_input', 'waiting_approval'].includes(session.runtime) &&
    now - Date.parse(session.updatedAt) > 10 * 60_000
  )
    return 'stale';
  return session.runtime;
}
export function correctionSignals(sessions: Session[]) {
  const result: {
    id: string;
    sessionId: string;
    title: string;
    category: string;
    text: string;
    skill: string | null;
    at: string;
  }[] = [];
  for (const s of sessions)
    for (const m of s.messages) {
      if (m.role !== 'user' || m.text === s.goal || m.text.length > 2500) continue;
      if (
        !/\b(still|again|you missed|you forgot|incorrect|not what I asked|doesn.t match|please fix)\b/i.test(
          m.text,
        )
      )
        continue;
      let category = '';
      if (/\b(overflow|layout|clipped|spacing|alignment|responsive|font size)\b/i.test(m.text))
        category = 'Layout';
      else if (
        /\b(wrong number|incorrect|inaccurate|calculation|invented|factually)\b/i.test(m.text)
      )
        category = 'Accuracy';
      else if (/\b(missed|forgot|missing section|requirement|instruction)\b/i.test(m.text))
        category = 'Missing requirement';
      if (category)
        result.push({
          id: `${s.id}:${m.id}`,
          sessionId: s.id,
          title: s.title,
          category,
          text: m.text.slice(0, 700),
          skill: s.skill ?? null,
          at: m.at,
        });
    }
  return result.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
}
export function normalizeHook(provider: Provider, event: any, prior?: Session): Session {
  const sourceId = event.session_id ?? event.conversation_id;
  if (!safeId(sourceId)) throw new Error('Hook is missing a valid session ID');
  const name = event.hook_event_name ?? event.event;
  const states: Record<string, Runtime> = {
    SessionStart: 'idle',
    UserPromptSubmit: 'working',
    PreToolUse: 'working',
    PostToolUse: 'working',
    PermissionRequest: 'waiting_approval',
    Stop: 'idle',
    StopFailure: 'error',
    SessionEnd: 'idle',
    Interrupt: 'interrupted',
    beforeSubmitPrompt: 'working',
    beforeShellExecution: 'working',
    afterShellExecution: 'working',
    afterAgentResponse: 'working',
    stop: 'idle',
  };
  if (!Object.hasOwn(states, name) && name !== 'Notification')
    throw new Error('Unsupported hook event');
  const at = new Date().toISOString();
  const session: Session = prior
    ? structuredClone(prior)
    : {
        id: `${provider}:${sourceId}`,
        sourceId,
        provider,
        title: 'New session',
        project: basename(event.cwd || event.workspace_roots?.[0] || '') || 'Unassigned',
        cwd: event.cwd || event.workspace_roots?.[0] || '',
        model: event.model || 'Not recorded',
        goal: '',
        latest: '',
        runtime: 'idle',
        updatedAt: at,
        sourcePath: '',
        messages: [],
        tasks: [],
        truncated: false,
        provenance: 'hook',
      };
  session.runtime =
    name === 'Notification'
      ? event.notification_type === 'permission_prompt'
        ? 'waiting_approval'
        : 'waiting_input'
      : states[name];
  session.updatedAt = at;
  session.provenance = 'hook';
  const raw =
    typeof event.prompt === 'string'
      ? event.prompt
      : typeof event.last_assistant_message === 'string'
        ? event.last_assistant_message
        : '';
  if (raw) {
    const text = cleanText(raw),
      role = typeof event.prompt === 'string' ? 'user' : 'assistant';
    session.messages.push({ role, text, at, id: hash(`${at}:${text}`).slice(0, 20) });
    session.messages = session.messages.slice(-50);
    if (!session.goal && role === 'user') {
      session.goal = text.slice(0, 700);
      session.title = text.slice(0, 100);
    }
    if (role === 'assistant') session.latest = text.slice(0, 1200);
  }
  return session;
}
