import { readdir, stat, open, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import { parseTranscript, normalizeHook } from './normalize.ts';
import { Store } from './store.ts';
import type { Provider, Connection } from './types.ts';
export const providers: Provider[] = ['codex', 'claude', 'cursor'];
export function defaultRoots(home = homedir()): Record<Provider, string[]> {
  return {
    codex: [join(home, '.codex/sessions')],
    claude: [
      join(home, '.claude/projects'),
      join(home, 'Library/Application Support/Claude/claude-code-sessions'),
    ],
    cursor: [join(home, '.cursor/projects')],
  };
}
export function isTranscript(provider: Provider, file: string): boolean {
  if (file.includes('/subagents/') || file.includes('/skills-plugin/')) return false;
  if (provider === 'codex') return file.endsWith('.jsonl');
  if (provider === 'claude')
    return (
      file.endsWith('.jsonl') &&
      (/\/(?:\.claude\/)?projects\//.test(file) || file.includes('/claude-code-sessions/')) &&
      !file.includes('/local-agent-mode-sessions/') &&
      !basename(file).startsWith('agent-')
    );
  return file.includes('/agent-transcripts/') && /\.(jsonl|txt)$/.test(file);
}
async function walk(dir: string, depth = 0, budget = { n: 0 }): Promise<string[]> {
  if (depth > 12 || budget.n > 12_000) return [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    if (++budget.n > 12_000) break;
    if (
      e.isSymbolicLink() ||
      [
        'node_modules',
        '.git',
        'skills-plugin',
        'skills',
        'agent-tools',
        'terminals',
        'subagents',
      ].includes(e.name)
    )
      continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p, depth + 1, budget)));
    else if (e.isFile() && /\.(jsonl|txt)$/.test(e.name)) out.push(p);
  }
  return out;
}
async function boundedRead(file: string, size: number) {
  const limit = 2 * 1024 * 1024;
  if (size <= limit) return { text: await readFile(file, 'utf8'), truncated: false };
  const f = await open(file, 'r');
  try {
    const head = Buffer.alloc(128 * 1024),
      tail = Buffer.alloc(limit);
    await f.read(head, 0, head.length, 0);
    await f.read(tail, 0, tail.length, size - tail.length);
    const h = head.toString('utf8'),
      t = tail.toString('utf8');
    return {
      text: h.slice(0, h.lastIndexOf('\n')) + '\n' + t.slice(t.indexOf('\n') + 1),
      truncated: true,
    };
  } finally {
    await f.close();
  }
}
export class Collector {
  store: Store;
  dataDir: string;
  roots: Record<Provider, string[]>;
  fingerprints = new Map<string, string>();
  busy = false;
  constructor(store: Store, dataDir: string, roots = defaultRoots()) {
    this.store = store;
    this.dataDir = dataDir;
    this.roots = roots;
  }
  connections(): Connection[] {
    return providers.map((provider) => ({
      provider,
      enabled: this.store.setting(`enabled:${provider}`, false),
      roots: this.roots[provider].filter(existsSync),
      found: this.store.sessions(false).filter((s) => s.provider === provider).length,
      ...this.store.setting(`scan:${provider}`, {}),
    }));
  }
  async scan() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (const provider of providers) {
        if (!this.store.setting(`enabled:${provider}`, false)) continue;
        try {
          const candidates: { path: string; mtime: number; size: number }[] = [];
          for (const root of this.roots[provider])
            for (const path of await walk(root))
              if (isTranscript(provider, path)) {
                const s = await stat(path);
                candidates.push({ path, mtime: s.mtimeMs, size: s.size });
              }
          for (const file of candidates.sort((a, b) => b.mtime - a.mtime).slice(0, 120)) {
            const fp = `${file.mtime}:${file.size}`;
            if (this.fingerprints.get(file.path) === fp) continue;
            const { text, truncated } = await boundedRead(file.path, file.size);
            const session = parseTranscript(
              provider,
              text,
              file.path,
              new Date(file.mtime).toISOString(),
              truncated,
            );
            if (session) this.store.save(session);
            this.fingerprints.set(file.path, fp);
          }
          this.store.set(`scan:${provider}`, { lastScan: new Date().toISOString() });
        } catch {
          this.store.set(`scan:${provider}`, {
            lastScan: new Date().toISOString(),
            error: 'A history source could not be read. Check its permissions.',
          });
        }
      }
      const inbox = join(this.dataDir, 'inbox');
      let files: string[] = [];
      try {
        files = await readdir(inbox);
      } catch {}
      for (const name of files.filter((n) => /^[a-f0-9-]+\.json$/.test(n)).slice(0, 200)) {
        const path = join(inbox, name);
        try {
          const info = await stat(path);
          if (info.size > 128 * 1024) continue;
          const { provider, event } = JSON.parse(await readFile(path, 'utf8'));
          if (providers.includes(provider) && this.store.setting(`enabled:${provider}`, false)) {
            const id = event.session_id ?? event.conversation_id;
            this.store.save(normalizeHook(provider, event, this.store.get(`${provider}:${id}`)));
          }
        } catch {
          /* Ignore malformed observations; never execute input. */
        }
        await unlink(path).catch(() => {});
      }
    } finally {
      this.busy = false;
    }
  }
}
