import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Session, Report, SkillSuite, Provider } from './types.ts';
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(
      `PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS corrections(id TEXT PRIMARY KEY, session_id TEXT, category TEXT, note TEXT, skill TEXT, created_at TEXT); CREATE TABLE IF NOT EXISTS suites(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, data TEXT NOT NULL);`,
    );
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT data FROM settings WHERE key=?').get(key);
    return row ? JSON.parse(String(row.data)) : fallback;
  }
  set(key: string, value: unknown) {
    this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, JSON.stringify(value));
  }
  get(id: string): Session | undefined {
    const row = this.db.prepare('SELECT data FROM sessions WHERE id=?').get(id);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  save(session: Session) {
    const old = this.get(session.id);
    const next = {
      ...session,
      reviewedAt: old?.reviewedAt,
      acceptedAt: old?.acceptedAt,
      pinnedGoal: old?.pinnedGoal,
      correctionCount: old?.correctionCount ?? 0,
      skill: old?.skill,
    };
    if (
      old?.provenance === 'hook' &&
      session.provenance === 'history' &&
      Date.parse(old.updatedAt) > Date.parse(session.updatedAt)
    )
      Object.assign(next, { runtime: old.runtime, updatedAt: old.updatedAt, provenance: 'hook' });
    this.db
      .prepare('INSERT OR REPLACE INTO sessions VALUES (?,?)')
      .run(next.id, JSON.stringify(next));
  }
  patch(
    id: string,
    data: Partial<Pick<Session, 'reviewedAt' | 'acceptedAt' | 'pinnedGoal' | 'skill'>>,
  ) {
    const old = this.get(id);
    if (!old) throw new Error('Session not found');
    this.db
      .prepare('UPDATE sessions SET data=? WHERE id=?')
      .run(JSON.stringify({ ...old, ...data }), id);
  }
  sessions(demo: boolean) {
    return (
      this.db
        .prepare('SELECT data FROM sessions')
        .all()
        .map((r) => JSON.parse(String(r.data))) as Session[]
    )
      .filter((s) => (s.provenance === 'demo') === demo)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  forget(provider: Provider) {
    for (const s of this.sessions(false))
      if (s.provider === provider) {
        this.db.prepare('DELETE FROM sessions WHERE id=?').run(s.id);
        this.db.prepare('DELETE FROM corrections WHERE session_id=?').run(s.id);
      }
  }
  correction(id: string, category: string, note: string, skill: string) {
    const s = this.get(id);
    if (!s) throw new Error('Session not found');
    this.db
      .prepare('INSERT INTO corrections VALUES (?,?,?,?,?,?)')
      .run(randomUUID(), id, category, note, skill, new Date().toISOString());
    s.correctionCount = (s.correctionCount ?? 0) + 1;
    s.skill = skill;
    this.db.prepare('UPDATE sessions SET data=? WHERE id=?').run(JSON.stringify(s), id);
  }
  opportunities(demo: boolean) {
    const sessions = new Map(this.sessions(demo).map((s) => [s.id, s]));
    const groups = new Map<string, any>();
    for (const r of this.db.prepare('SELECT * FROM corrections ORDER BY created_at DESC').all()) {
      const session = sessions.get(String(r.session_id));
      if (!session) continue;
      const key = `${r.skill}:${r.category}`;
      if (!groups.has(key))
        groups.set(key, {
          id: key,
          skill: r.skill,
          category: r.category,
          evidence: [],
          sessionIds: new Set(),
          count: 0,
        });
      const g = groups.get(key);
      g.count++;
      g.sessionIds.add(session.id);
      g.evidence.push({
        sessionId: session.id,
        title: session.title,
        note: r.note,
        at: r.created_at,
      });
    }
    return [...groups.values()]
      .map((g) => ({
        ...g,
        sessions: g.sessionIds.size,
        sessionIds: [...g.sessionIds],
        confidence: g.sessionIds.size >= 2 ? 'Recurring across sessions' : 'Single-session signal',
      }))
      .sort((a, b) => b.sessions - a.sessions || b.count - a.count);
  }
  suites(): SkillSuite[] {
    return this.db
      .prepare('SELECT data FROM suites')
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  suite(id: string) {
    return this.suites().find((x) => x.id === id);
  }
  saveSuite(s: SkillSuite) {
    this.db.prepare('INSERT OR REPLACE INTO suites VALUES (?,?)').run(s.id, JSON.stringify(s));
  }
  saveReport(r: Report) {
    this.db.prepare('INSERT OR REPLACE INTO reports VALUES (?,?)').run(r.id, JSON.stringify(r));
  }
  reports(): Report[] {
    return this.db
      .prepare('SELECT data FROM reports ORDER BY rowid DESC LIMIT 30')
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  close() {
    this.db.close();
  }
}
