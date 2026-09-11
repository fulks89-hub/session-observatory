import type { Provider } from './types.ts';
export type Usage = {
  input: number;
  output: number;
  cached: number;
  cacheWrite: number;
  reasoning: number;
  total: number;
  records: number;
  partial: boolean;
};
export type SkillEvidence = { name: string; kind: 'invocation' | 'reference'; count: number };
export type Telemetry = {
  usage: Usage | null;
  skills: SkillEvidence[];
  userTurns: number;
  assistantTurns: number;
  toolCalls: number;
  partial: boolean;
};
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
export function transcriptTelemetry(provider: Provider, text: string, partial = false): Telemetry {
  let cumulative: Usage | null = null;
  const usage = new Map<string, any>(),
    users = new Set<string>(),
    assistants = new Set<string>(),
    tools = new Set<string>();
  const skills = new Map<string, SkillEvidence>();
  const skill = (name: unknown, kind: SkillEvidence['kind']) => {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9@_.:/-]{1,160}$/.test(name)) return;
    const key = kind + ':' + name,
      old = skills.get(key);
    skills.set(key, { name, kind, count: (old?.count ?? 0) + 1 });
  };
  for (const [i, line] of text.split('\n').entries()) {
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (!r || typeof r !== 'object') continue;
    const p = r.payload ?? {},
      m = r.message ?? {},
      id = String(r.uuid ?? r.id ?? i);
    if (provider === 'codex') {
      if (r.type === 'event_msg' && p.type === 'token_count' && p.info?.total_token_usage) {
        const u = p.info.total_token_usage;
        cumulative = {
          input: n(u.input_tokens),
          output: n(u.output_tokens),
          cached: n(u.cached_input_tokens),
          cacheWrite: 0,
          reasoning: n(u.reasoning_output_tokens),
          total: n(u.total_tokens) || n(u.input_tokens) + n(u.output_tokens),
          records: 1,
          partial,
        };
      }
      // These canonical events avoid counting the mirrored response_item messages twice.
      if (r.type === 'event_msg' && p.type === 'user_message') users.add(id);
      if (r.type === 'event_msg' && p.type === 'agent_message') assistants.add(id);
      if (r.type === 'response_item' && ['function_call', 'custom_tool_call'].includes(p.type)) {
        const key = String(p.call_id ?? id);
        if (tools.has(key)) continue;
        tools.add(key);
        let args: any;
        try {
          args = JSON.parse(p.arguments ?? p.input ?? '{}');
        } catch {
          args = {};
        }
        if (/(^|\.)skill$/i.test(p.name ?? '')) skill(args.skill ?? args.name, 'invocation');
        // A referenced file is evidence of a tool argument, not proof of invocation or compliance.
        const raw = String(p.arguments ?? p.input ?? '');
        for (const match of raw.matchAll(/(?:[\\/])([a-zA-Z0-9_.-]+)[\\/]SKILL\.md\b/g))
          skill(match[1], 'reference');
      }
    } else {
      const role = r.role ?? r.type;
      if (
        role === 'user' &&
        (typeof m.content === 'string' ||
          typeof r.content === 'string' ||
          (m.content ?? r.content ?? []).some?.((b: any) => b.type === 'text'))
      )
        users.add(id);
      if (role === 'assistant') {
        assistants.add(String(m.id ?? id));
        if (m.usage) {
          const key = String(m.id ?? id),
            old = usage.get(key) ?? {},
            next = { ...old };
          for (const [k, v] of Object.entries(m.usage))
            if (typeof v === 'number') next[k] = Math.max(n(old[k]), n(v));
          usage.set(key, next);
        }
        for (const b of Array.isArray(m.content) ? m.content : []) {
          if (b.type !== 'tool_use') continue;
          const key = String(b.id ?? id + ':' + b.name);
          if (tools.has(key)) continue;
          tools.add(key);
          if (b.name === 'Skill') skill(b.input?.skill, 'invocation');
          if (b.name === 'Read') {
            const match = String(b.input?.file_path ?? '').match(
              /[/\\]([a-zA-Z0-9_.-]+)[/\\]SKILL\.md$/,
            );
            if (match) skill(match[1], 'reference');
          }
        }
      }
    }
  }
  if (provider !== 'codex' && usage.size) {
    cumulative = {
      input: 0,
      output: 0,
      cached: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: 0,
      records: usage.size,
      partial,
    };
    for (const u of usage.values()) {
      const cached = n(u.cache_read_input_tokens),
        written = n(u.cache_creation_input_tokens);
      cumulative.input += n(u.input_tokens) + cached + written;
      cumulative.output += n(u.output_tokens);
      cumulative.cached += cached;
      cumulative.cacheWrite += written;
    }
    cumulative.total = cumulative.input + cumulative.output;
  }
  return {
    usage: cumulative,
    skills: [...skills.values()],
    userTurns: users.size,
    assistantTurns: assistants.size,
    toolCalls: tools.size,
    partial,
  };
}
