import React, { useMemo, useState } from 'react';
import { BarChart3, Coins, Repeat2, Sparkles, ArrowUpRight, CheckCheck } from 'lucide-react';
import type { Session } from '../src/types.ts';
export const number = (n: number) =>
  new Intl.NumberFormat('en', {
    notation: n >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(n);
export function Insights({
  sessions,
  openSession,
  demo,
}: {
  sessions: Session[];
  openSession: (id: string) => void;
  demo: boolean;
}) {
  const [range, setRange] = useState('all'),
    [provider, setProvider] = useState('all');
  const data = useMemo(
    () =>
      sessions.filter(
        (s) =>
          (provider === 'all' || s.provider === provider) &&
          (range === 'all' || Date.parse(s.updatedAt) >= Date.now() - Number(range) * 86400_000),
      ),
    [sessions, range, provider],
  );
  const measured = data.filter((s) => s.telemetry?.usage);
  const input = measured.reduce((sum, s) => sum + s.telemetry!.usage!.input, 0),
    cached = measured.reduce((sum, s) => sum + s.telemetry!.usage!.cached, 0);
  const tokens = measured.reduce((sum, s) => sum + s.telemetry!.usage!.total, 0),
    corrections = data.reduce((sum, s) => sum + (s.correctionCount ?? 0), 0);
  const models = new Map<string, { tokens: number; sessions: number }>();
  const skills = new Map<
    string,
    {
      sessions: number;
      invocations: number;
      references: number;
      corrections: number;
      accepted: number;
    }
  >();
  for (const s of data) {
    if (s.telemetry?.usage) {
      const key = s.provider,
        row = models.get(key) ?? { tokens: 0, sessions: 0 };
      row.tokens += s.telemetry.usage.total;
      row.sessions++;
      models.set(key, row);
    }
    const perSession = new Map<string, { invocations: number; references: number }>();
    for (const e of s.telemetry?.skills ?? []) {
      const row = perSession.get(e.name) ?? { invocations: 0, references: 0 };
      row[e.kind === 'invocation' ? 'invocations' : 'references'] += e.count;
      perSession.set(e.name, row);
    }
    if (s.skill && !perSession.has(s.skill))
      perSession.set(s.skill, { invocations: 0, references: 0 });
    for (const [name, evidence] of perSession) {
      const row = skills.get(name) ?? {
        sessions: 0,
        invocations: 0,
        references: 0,
        corrections: 0,
        accepted: 0,
      };
      row.sessions++;
      row.invocations += evidence.invocations;
      row.references += evidence.references;
      // Only user-associated corrections can be attributed to a skill.
      if (s.skill === name) row.corrections += s.correctionCount ?? 0;
      if (s.acceptedAt && s.acceptedAt >= s.updatedAt) row.accepted++;
      skills.set(name, row);
    }
  }
  const rows = [...models].sort((a, b) => b[1].tokens - a[1].tokens),
    max = Math.max(1, ...rows.map((r) => r[1].tokens));
  return (
    <>
      <div className="page-heading">
        <div className="eyebrow">LEARN FROM YOUR WORK</div>
        <div className="heading-row">
          <div>
            <h1>
              Usage & skills<span className="heading-dot">.</span>
            </h1>
            <p>Where the tokens went. Where another pass was needed.</p>
          </div>
          <span className="insight-scope">
            <BarChart3 size={16} /> {demo ? 'Illustrative data' : 'Local history'}
          </span>
        </div>
      </div>
      <div className="insights-filters">
        <label>
          Session activity
          <select
            aria-label="Usage date range"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="all">All collected history</option>
            <option value="7">Active in the last 7 days</option>
            <option value="30">Active in the last 30 days</option>
          </select>
        </label>
        <label>
          App
          <select
            aria-label="Usage provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="all">All apps</option>
            <option value="codex">Codex</option>
            <option value="claude">Claude Code</option>
            <option value="cursor">Cursor</option>
          </select>
        </label>
        <p>
          {data.length} sessions · {measured.length} with token records
        </p>
      </div>
      <div className="insight-metrics">
        {[
          [
            Coins,
            measured.length ? number(tokens) : '—',
            'Recorded tokens',
            `${measured.length} of ${data.length} sessions covered`,
          ],
          [
            Repeat2,
            input ? Math.round((cached / input) * 100) + '%' : '—',
            'Input cache reuse',
            'Cached input ÷ recorded input',
          ],
          [
            Sparkles,
            number(corrections),
            'Recorded corrections',
            'Human feedback, not guessed failures',
          ],
          [
            CheckCheck,
            number(data.filter((s) => s.acceptedAt && s.acceptedAt >= s.updatedAt).length),
            'Accepted results',
            'Explicit human acceptance',
          ],
        ].map(([Icon, value, label, sub]: any) => (
          <article className="insight-metric" key={label}>
            <Icon size={19} />
            <strong>{value}</strong>
            <span>{label}</span>
            <small>{sub}</small>
          </article>
        ))}
      </div>
      <div className="insight-columns">
        <section className="insight-panel">
          <div className="section-row">
            <h2>Usage by app</h2>
            <span className="eyebrow">TOKENS</span>
          </div>
          {rows.length ? (
            rows.map(([name, r]) => (
              <div className="model-row" key={name}>
                <div>
                  <span>{name}</span>
                  <strong>{number(r.tokens)}</strong>
                </div>
                <div className="usage-track">
                  <span style={{ width: `${(r.tokens / max) * 100}%` }} />
                </div>
                <small>{r.sessions} sessions with recorded usage</small>
              </div>
            ))
          ) : (
            <div className="insight-empty">
              No token records in this selection. Missing usage is not counted as zero.
            </div>
          )}
        </section>
        <section className="insight-panel insight-explainer">
          <div className="eyebrow">MEASURE, THEN IMPROVE</div>
          <h2>Efficiency needs context.</h2>
          <p>
            Compare follow-ups, recorded corrections and accepted results alongside usage. A shorter
            or cheaper run is not automatically better.
          </p>
          <div className="coverage-line">
            <span>Token coverage</span>
            <strong>{data.length ? Math.round((measured.length / data.length) * 100) : 0}%</strong>
          </div>
          <div className="usage-track">
            <span
              style={{ width: `${data.length ? (measured.length / data.length) * 100 : 0}%` }}
            />
          </div>
          <small>
            These are collected-session totals, not your provider bill, remaining quota or daily
            spend. Date filters select sessions by last activity. Truncated histories may be
            incomplete.
          </small>
        </section>
      </div>
      <section className="insight-panel">
        <div className="section-row">
          <div>
            <h2>Skill signals</h2>
            <p className="muted">Repeated corrections identify opportunities worth reviewing.</p>
          </div>
          <Sparkles size={20} />
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Skill</th>
                <th>Sessions</th>
                <th>Invocations</th>
                <th>Tool references</th>
                <th>Corrections</th>
                <th>Accepted</th>
              </tr>
            </thead>
            <tbody>
              {[...skills]
                .sort((a, b) => b[1].corrections - a[1].corrections)
                .map(([name, r]) => (
                  <tr key={name}>
                    <td>
                      <strong>{name}</strong>
                      {r.corrections >= 2 && (
                        <span className="opportunity-chip">Review opportunity</span>
                      )}
                    </td>
                    <td>{r.sessions}</td>
                    <td>{r.invocations || '—'}</td>
                    <td>{r.references || '—'}</td>
                    <td>{r.corrections}</td>
                    <td>{r.accepted}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!skills.size && (
          <p className="insight-empty">
            No explicit skill evidence yet. Associate a skill when recording a correction, or
            collect a transcript containing a skill invocation.
          </p>
        )}
        <p className="fine-print">
          Invocations come from explicit skill-tool events. References mean a skill path appeared in
          a tool call; they do not prove execution or rule compliance. Corrections are attributed
          only to the skill you selected. Per-skill token cost is not inferred from whole-session
          totals.
        </p>
      </section>
      <section className="insight-panel">
        <h2>Session history</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Session</th>
                <th>Tokens</th>
                <th>User turns</th>
                <th>Tool calls</th>
                <th>Corrections</th>
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <button className="history-link" onClick={() => openSession(s.id)}>
                      {s.title}
                      <ArrowUpRight size={14} />
                    </button>
                    <small>
                      {s.provider} · {s.project} · {s.model} (last recorded model)
                      {s.telemetry?.partial ? ' · partial history' : ''}
                    </small>
                  </td>
                  <td>{s.telemetry?.usage ? number(s.telemetry.usage.total) : 'Not recorded'}</td>
                  <td>{s.telemetry?.userTurns || '—'}</td>
                  <td>{s.telemetry?.toolCalls || '—'}</td>
                  <td>{s.correctionCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
