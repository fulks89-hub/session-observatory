import { Insights } from './Insights.tsx';
import { CommandComposer } from './CommandComposer.tsx';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  Flag,
  BarChart3,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  Circle,
  CircleAlert,
  Clock3,
  Copy,
  ExternalLink,
  FlaskConical,
  Folder,
  GitBranch,
  Layers3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import type { Session, SkillSuite, Report } from '../src/types.ts';
import { nativeThreadHref } from '../src/navigation.ts';
import './style.css';
const labels: Record<string, string> = {
  working: 'Working',
  waiting_input: 'Needs your input',
  waiting_approval: 'Needs approval',
  idle: 'Idle',
  interrupted: 'Interrupted',
  error: 'Blocked',
  stale: 'Activity unknown',
};
const appNames: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
  cursor: 'Cursor',
};
async function api(path: string, data?: unknown) {
  const r = await fetch('/api' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const v = await r.json();
  if (!r.ok) throw new Error(v.error || 'Request failed');
  return v;
}
function ago(value: string) {
  const seconds = Math.max(0, (Date.now() - Date.parse(value)) / 1000);
  return seconds < 60
    ? 'just now'
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h ago`
        : `${Math.floor(seconds / 86400)}d ago`;
}
function download(name: string, value: unknown) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function App() {
  const [page, setPage] = useState('queue'),
    [demo, setDemo] = useState(new URLSearchParams(location.search).get('demo') === '1');
  const [state, setState] = useState<any>(null),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('recent'),
    [selected, setSelected] = useState<Session | null>(null),
    [busy, setBusy] = useState(false);
  const [suite, setSuite] = useState<SkillSuite | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [modelConfirm, setModelConfirm] = useState(false),
    [modelAction, setModelAction] = useState<'optimize' | 'synthesize'>('optimize');
  const importRef = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    try {
      setState(await api(`/state?demo=${demo ? 1 : 0}`));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [demo]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openSession = async (id: string) =>
    act(async () => setSelected(await api('/session/' + encodeURIComponent(id))));
  const chooseSuite = async (id: string) =>
    act(async () => {
      setSuite(await api('/suite/' + id));
      setReport(null);
    });
  const sessions = (state?.sessions ?? []) as (Session & { nativeHref?: string })[];
  const recent = (s: Session) =>
    s.provenance === 'demo' || Date.now() - Date.parse(s.updatedAt) < 48 * 3600_000;
  const needsReview = (s: Session) => recent(s) && (!s.reviewedAt || s.updatedAt > s.reviewedAt);
  const accepted = (s: Session) => Boolean(s.acceptedAt && s.acceptedAt >= s.updatedAt);
  const attention = sessions.filter((s) => (s.attention || s.runtime === 'error') && !accepted(s));
  const waiting = sessions.filter((s) => s.runtime === 'idle' && needsReview(s));
  const working = sessions.filter((s) => s.runtime === 'working');
  const rank = (s: Session) =>
    accepted(s)
      ? 5
      : s.attention || s.runtime === 'error'
        ? 0
        : s.runtime === 'idle' && needsReview(s)
          ? 1
          : s.runtime === 'working'
            ? 2
            : 4;
  const shown = sessions
    .filter((s) =>
      `${s.title} ${s.project} ${s.goal} ${s.provider}`.toLowerCase().includes(query.toLowerCase()),
    )
    .filter(
      (s) =>
        filter === 'all' ||
        (filter === 'recent' && recent(s)) ||
        (filter === 'attention' && attention.includes(s)) ||
        (filter === 'flagged' && Boolean(s.attention) && !accepted(s)) ||
        (filter === 'review' && waiting.includes(s)) ||
        (filter === 'working' && s.runtime === 'working') ||
        (filter === 'accepted' && accepted(s)),
    )
    .sort((a, b) => rank(a) - rank(b) || b.updatedAt.localeCompare(a.updatedAt));
  const navigate = (next: string) => {
    setPage(next);
    setSelected(null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          aria-label="Observatory Switchboard"
          onClick={() => navigate('queue')}
        >
          <span className="brand-symbol">
            <Layers3 size={24} />
          </span>
          <span>
            observatory<span className="brand-sub">switchboard</span>
          </span>
        </button>
        <div className="workspace">
          <span className="online-dot" />
          <div>
            This machine<small>Local workspace</small>
          </div>
          <LockKeyhole size={14} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {[
            ['queue', 'Session board', Layers3, sessions.length],
            ['insights', 'Usage & skills', BarChart3, null],
            ['opportunities', 'Opportunities', Sparkles, state?.opportunities?.length ?? 0],
            ['lab', 'Skill lab', FlaskConical, null],
          ].map(([id, label, Icon, count]: any) => (
            <button
              key={id}
              aria-label={label}
              className={page === id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {count !== null && <span className="nav-count">{count}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label second-label">CONFIGURATION</div>
        <nav>
          {[
            ['connections', 'Connections', Link2],
            ['rules', 'Rule checks', ShieldCheck],
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              aria-label={label}
              className={page === id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div>
            <span className="online-dot" /> Stored on this machine
          </div>
          <p>No Mission Control or Observatory installation required.</p>
          <span className="version">v0.1 · local preview</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />{' '}
            <strong>
              {
                {
                  queue: 'Session board',
                  insights: 'Usage & skills',
                  opportunities: 'Opportunities',
                  lab: 'Skill lab',
                  connections: 'Connections',
                  rules: 'Rule checks',
                }[page]
              }
            </strong>
          </div>
          <div className="top-actions">
            <span className="mode-label">{demo ? 'SYNTHETIC EXAMPLES' : 'LOCAL SESSIONS'}</span>
            <button
              className="small-button"
              onClick={() => {
                setDemo(!demo);
                setSelected(null);
                setFilter('all');
              }}
            >
              {demo ? 'Use my sessions' : 'Explore demo'}
            </button>
            <button
              className="icon-button"
              aria-label="Refresh"
              onClick={() =>
                act(async () => {
                  await api('/scan', {});
                })
              }
            >
              <RefreshCw size={17} className={busy ? 'spin' : ''} />
            </button>
          </div>
        </header>
        <main>
          {error && (
            <div className="notice error" role="alert">
              <CircleAlert size={18} />
              {error}
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {demo && (
            <div className="demo-note">
              <FlaskConical size={15} /> Demo mode · These sessions and feedback examples are
              fictional.{' '}
              <button onClick={() => setDemo(false)}>
                Switch to your sessions <ArrowRight size={14} />
              </button>
            </div>
          )}
          {page === 'queue' && (
            <>
              <div className="page-heading">
                <div className="eyebrow">PICK UP WHERE YOU LEFT OFF</div>
                <div className="heading-row">
                  <div>
                    <h1>
                      Session board<span className="heading-dot">.</span>
                    </h1>
                    <p>The goal, the latest change, and the next decision.</p>
                  </div>
                  <button className="secondary" onClick={() => navigate('connections')}>
                    <Plus size={17} /> Connect an app
                  </button>
                </div>
              </div>
              {sessions.some((s) => s.attention) && (
                <div className="attention-banner" role="status">
                  <span className="attention-banner-icon">
                    <Flag size={22} />
                  </span>
                  <div>
                    <strong>
                      {sessions.filter((s) => s.attention).length}{' '}
                      {sessions.filter((s) => s.attention).length === 1
                        ? 'session needs'
                        : 'sessions need'}{' '}
                      a look from you
                    </strong>
                    <p>
                      Reply requests and approvals are flagged on their cards. Older or inferred
                      requests are labeled.
                    </p>
                  </div>
                  <button className="secondary" onClick={() => setFilter('flagged')}>
                    Show flagged <ArrowRight size={15} />
                  </button>
                </div>
              )}
              <div className="stats">
                {[
                  [attention.length, 'Need your attention', 'attention', CircleAlert],
                  [waiting.length, 'Ready for review', 'review', CheckCheck],
                  [working.length, 'Working now', 'working', Activity],
                  [sessions.filter(accepted).length, 'Accepted', 'accepted', Check],
                ].map(([count, label, key, Icon]: any) => (
                  <button
                    className={`stat ${filter === key ? 'selected' : ''}`}
                    key={key}
                    onClick={() => setFilter(filter === key ? 'all' : key)}
                  >
                    <span className={`stat-icon ${key}`}>
                      <Icon size={19} />
                    </span>
                    <span className="stat-number">{count}</span>
                    <span className="stat-label">{label}</span>
                    <ArrowRight size={15} />
                  </button>
                ))}
              </div>
              <div className="board-toolbar">
                <div className="tabs">
                  {[
                    ['recent', 'Recent sessions'],
                    ['flagged', 'Waiting on you'],
                    ['review', 'Review queue'],
                    ['all', 'All history'],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      className={filter === id ? 'tab active' : 'tab'}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search sessions"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Find a session or project…"
                  />
                </label>
              </div>
              {!state ? (
                <div className="empty">
                  <LoaderCircle className="spin" />
                  Loading your workspace…
                </div>
              ) : shown.length === 0 ? (
                <div className="empty">
                  <span className="empty-icon">
                    <Layers3 size={30} />
                  </span>
                  <h2>
                    {sessions.length ? 'No sessions match this view' : 'Your workspace starts here'}
                  </h2>
                  <p>
                    {sessions.length
                      ? 'Try another filter or search.'
                      : 'Connect an app to read its local session history. Collection stays on this machine.'}
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      sessions.length ? (setFilter('all'), setQuery('')) : navigate('connections')
                    }
                  >
                    {sessions.length ? 'Show all sessions' : 'Connect an app'}
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="session-grid">
                  {shown.map((s) => (
                    <article
                      className={`session-card ${attention.includes(s) ? 'needs-attention' : ''}`}
                      key={s.id}
                    >
                      {s.attention && (
                        <div className={`waiting-flag ${s.attention.confirmed ? '' : 'inferred'}`}>
                          <Flag size={14} />
                          <strong>{s.attention.label}</strong>
                          {!s.attention.confirmed && <small>Suggested</small>}
                        </div>
                      )}
                      <div className="card-top">
                        <span className={`provider-mark ${s.provider}`}>
                          {s.provider === 'codex' ? 'C' : s.provider === 'claude' ? '✳' : '↗'}
                        </span>
                        <span className="provider-name">{appNames[s.provider]}</span>
                        <span className={`status ${accepted(s) ? 'accepted' : s.runtime}`}>
                          <span />
                          {accepted(s)
                            ? 'Accepted'
                            : s.runtime === 'idle' && needsReview(s)
                              ? 'Ready for review'
                              : s.runtime === 'idle' && s.reviewedAt
                                ? 'Reviewed'
                                : labels[s.runtime]}
                        </span>
                      </div>
                      <button className="card-title" onClick={() => openSession(s.id)}>
                        {s.title}
                        <ArrowRight size={17} />
                      </button>
                      <div className="project-line">
                        <Folder size={13} />
                        <span>{s.project}</span>
                        <span className="separator">·</span>
                        <span>{ago(s.updatedAt)}</span>
                      </div>
                      <div className="card-goal">
                        <span className="field-label">
                          GOAL {s.pinnedGoal ? '· PINNED' : '· EXCERPT'}
                        </span>
                        <p>{s.pinnedGoal || s.goal || 'Goal not yet observed.'}</p>
                      </div>
                      <div className="latest">
                        <span className="field-label">
                          {needsReview(s) ? 'LATEST UNREVIEWED UPDATE' : 'LATEST UPDATE'}
                        </span>
                        <p>
                          {s.latest?.split('\n\n- [')[0] || 'Waiting for the next observed update.'}
                        </p>
                      </div>
                      <div className="card-bottom">
                        <span className="task-count">
                          <CheckCheck size={14} />
                          {s.tasks.length
                            ? `${s.tasks.filter((t) => t.state === 'completed').length}/${s.tasks.length} checklist items`
                            : 'No explicit checklist'}
                        </span>
                        <button className="text-button" onClick={() => openSession(s.id)}>
                          Review <ChevronRight size={15} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="board-foot">
                <Radio size={14} /> Updates every 4 seconds · Old activity is marked unknown{' '}
                <span>Summaries are local excerpts, with source evidence.</span>
              </div>
            </>
          )}
          {page === 'insights' && (
            <Insights sessions={sessions} openSession={openSession} demo={demo} />
          )}
          {page === 'opportunities' && (
            <>
              <PageHeading
                eyebrow="MAKE REPEATED WORK EASIER"
                title="Opportunities"
                description="Recurring corrections, connected to the skill that needs attention."
              />
              {!state?.opportunities?.length ? (
                <div className="empty">
                  <Sparkles size={30} />
                  <h2>Start with a real correction</h2>
                  <p>
                    Open a session and flag a repeated correction. Link it to a skill revision to
                    build an evidence-backed opportunity.
                  </p>
                  <button className="primary" onClick={() => navigate('queue')}>
                    Review sessions
                    <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <div className="opportunity-list">
                  {state.opportunities.map((o: any) => (
                    <article className="opportunity" key={o.id}>
                      <div className="opportunity-icon">
                        <Sparkles size={23} />
                      </div>
                      <div>
                        <div className="eyebrow">
                          {o.category.toUpperCase()} · {o.confidence}
                        </div>
                        <h2>{o.skill}</h2>
                        <p>
                          {o.count} correction{o.count === 1 ? '' : 's'} across {o.sessions} session
                          {o.sessions === 1 ? '' : 's'}. Inspect the examples before choosing a fix.
                        </p>
                        <div className="evidence-list">
                          {o.evidence.slice(0, 4).map((e: any, i: number) => (
                            <button key={i} onClick={() => openSession(e.sessionId)}>
                              <MessageSquare size={15} />
                              <span>
                                {e.note}
                                <small>{e.title}</small>
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                        </div>
                        <div className="opportunity-footer">
                          <span>
                            <ShieldCheck size={14} /> Human-recorded feedback
                          </span>
                          <button className="secondary" onClick={() => navigate('lab')}>
                            Build an evaluation
                            <ArrowRight size={16} />
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {!!state?.suggestions?.length && (
                <section className="recent-reports">
                  <h2>Potential corrections to review</h2>
                  <p className="muted">
                    Detected locally from explicit correction language. These are suggestions, not
                    confirmed skill defects.
                  </p>
                  {state.suggestions.map((s: any) => (
                    <button key={s.id} onClick={() => openSession(s.sessionId)}>
                      <MessageSquare size={17} />
                      <span>
                        {s.text}
                        <small>
                          {s.title} · {s.category} · {s.skill || 'Skill not yet linked'}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
          {page === 'lab' && (
            <>
              <PageHeading
                eyebrow="MEASURE BEFORE YOU CHANGE"
                title="Skill lab"
                description="Compare skill versions, inspect the evidence, and keep required checks fixed."
              />
              <div className="lab-toolbar">
                <label>
                  Evaluation suite
                  <select
                    value={suite?.id ?? ''}
                    onChange={(e) => e.target.value && chooseSuite(e.target.value)}
                  >
                    <option value="">Choose a suite…</option>
                    {state?.suites?.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.cases} cases)
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      void act(async () => {
                        const s = JSON.parse(await file.text());
                        await api('/suites', s);
                        setSuite(s);
                        setReport(null);
                        setToast('Suite imported locally.');
                      });
                    e.target.value = '';
                  }}
                />
                <button className="secondary" onClick={() => importRef.current?.click()}>
                  <Plus size={16} /> Import suite JSON
                </button>
                <button
                  className="small-button"
                  onClick={() =>
                    act(async () =>
                      download('example-suite.json', await api('/suite/html-report-example')),
                    )
                  }
                >
                  <ArrowDownToLine size={15} /> Example format
                </button>
              </div>
              {!suite ? (
                <div className="lab-intro">
                  <div>
                    <span className="large-icon">
                      <FlaskConical size={36} />
                    </span>
                    <h2>A test bench for better skills.</h2>
                    <p>
                      Start with the sample HTML suite to see required checks in action, or import
                      your own skill versions, requests, and outputs.
                    </p>
                    <button className="primary" onClick={() => chooseSuite('html-report-example')}>
                      Open the sample suite
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <ol>
                    <li>
                      <span>01</span>
                      <div>
                        <strong>Keep the original</strong>
                        <p>Compare an isolated candidate against a frozen baseline.</p>
                      </div>
                    </li>
                    <li>
                      <span>02</span>
                      <div>
                        <strong>Test unseen requests</strong>
                        <p>Keep holdout cases away from candidate generation.</p>
                      </div>
                    </li>
                    <li>
                      <span>03</span>
                      <div>
                        <strong>Review the evidence</strong>
                        <p>Missing required checks block readiness for review.</p>
                      </div>
                    </li>
                  </ol>
                </div>
              ) : (
                <>
                  <div className="notice">
                    <ShieldCheck size={18} />
                    {suite.id === 'html-report-example'
                      ? 'Sample artifacts are supplied examples. Checking them does not demonstrate model or skill improvement.'
                      : 'Artifact checks evaluate supplied outputs. Model evaluations send this suite to the configured provider only after confirmation.'}
                  </div>
                  <div className="skill-versions">
                    <section>
                      <div className="panel-title">
                        <span className="version-chip">BASELINE</span>
                        <span>Preserved original</span>
                      </div>
                      <pre>{suite.baseline}</pre>
                    </section>
                    <section>
                      <div className="panel-title">
                        <span className="version-chip candidate">CANDIDATE</span>
                        <span>Isolated proposal</span>
                      </div>
                      <pre>{suite.candidate}</pre>
                    </section>
                  </div>
                  <div className="section-row">
                    <h2>
                      Test cases <span className="count-pill">{suite.cases.length}</span>
                    </h2>
                    <div>
                      <button
                        className="small-button"
                        onClick={() =>
                          act(async () =>
                            download(
                              `${suite.id}-promptfoo.json`,
                              await api('/promptfoo/' + suite.id),
                            ),
                          )
                        }
                      >
                        Export Promptfoo draft
                        <ArrowDownToLine size={15} />
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          act(async () => setReport(await api('/evaluate', { suiteId: suite.id })))
                        }
                      >
                        <FlaskConical size={16} /> Check saved artifacts
                      </button>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Request</th>
                          <th>Split</th>
                          <th>Required checks</th>
                          <th>Baseline</th>
                          <th>Candidate</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suite.cases.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <strong>{c.id}</strong>
                              <span>{c.prompt}</span>
                            </td>
                            <td>
                              <span className={`split ${c.split}`}>{c.split}</span>
                            </td>
                            <td>{c.checks.filter((x) => x.required).length}</td>
                            {['baseline', 'candidate'].map((v) => {
                              const result = report?.results.find(
                                (r) => r.caseId === c.id && r.variant === v,
                              );
                              return (
                                <td key={v}>
                                  {result ? (
                                    <span className={result.passed ? 'pass' : 'fail'}>
                                      {result.passed ? <Check size={15} /> : <X size={15} />}{' '}
                                      {result.checks.filter((x) => x.pass).length}/
                                      {result.checks.length}
                                    </span>
                                  ) : (
                                    <span className="muted">Not checked</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="model-panel">
                    <div>
                      <h3>
                        <Sparkles size={18} /> Generate and test with a model
                      </h3>
                      <p>
                        {state?.model
                          ? `${state.model.model} · ${state.model.endpoint} · hard cap of ${state.model.maxCalls} calls per batch`
                          : 'No model connected. Configure an approved endpoint to generate a candidate from training evidence and evaluate both versions.'}
                      </p>
                      <small>
                        API evaluations are not native Claude Code, Codex, or Cursor harness
                        certification.
                      </small>
                    </div>
                    <div className="model-buttons">
                      <button
                        className="secondary"
                        disabled={!state?.model || state?.job?.status === 'running' || busy}
                        onClick={() => {
                          setModelAction('synthesize');
                          setModelConfirm(true);
                        }}
                      >
                        <Plus size={16} />
                        Add synthetic cases
                      </button>
                      <button
                        className="secondary"
                        disabled={!state?.model || state?.job?.status === 'running' || busy}
                        onClick={() => {
                          setModelAction('optimize');
                          setModelConfirm(true);
                        }}
                      >
                        {state?.job?.status === 'running' ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <ArrowRight size={16} />
                        )}{' '}
                        Review model run
                      </button>
                    </div>
                  </div>
                  {state?.job && (
                    <div className="notice">
                      <Activity size={17} />
                      {state.job.message}
                      {state.job.reportId && (
                        <button
                          className="text-button"
                          onClick={() =>
                            act(async () => {
                              const r = await api('/report/' + state.job.reportId);
                              setSuite(await api('/suite/' + r.suiteId));
                              setReport(r);
                            })
                          }
                        >
                          Open result
                        </button>
                      )}
                    </div>
                  )}
                  {report && <ReportView report={report} />}
                </>
              )}
              {!!state?.reports?.length && (
                <section className="recent-reports">
                  <h2>Recent evaluations</h2>
                  {state.reports.slice(0, 5).map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        act(async () => {
                          setSuite(await api('/suite/' + r.suiteId));
                          setReport(await api('/report/' + r.id));
                        })
                      }
                    >
                      <FlaskConical size={17} />
                      <span>
                        {r.suiteId}
                        <small>
                          {r.kind} · {new Date(r.at).toLocaleString()}
                        </small>
                      </span>
                      <span className={r.eligible ? 'pass' : 'fail'}>
                        {r.eligible ? 'Checks passed' : 'Needs work'}
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </section>
              )}
            </>
          )}
          {page === 'connections' && (
            <>
              <PageHeading
                eyebrow="YOUR APPS, YOUR MACHINE"
                title="Connections"
                description="Choose which local session histories this app can observe."
              />
              <div className="notice">
                <LockKeyhole size={18} />
                Connecting reads local transcripts into this app’s private database. It does not
                install hooks, change agent rules, or send content to a model.
              </div>
              <div className="connection-grid">
                {state?.connections.map((c: any) => (
                  <section className="connection" key={c.provider}>
                    <div className="connection-top">
                      <span className={`provider-mark large ${c.provider}`}>
                        {c.provider === 'codex' ? 'C' : c.provider === 'claude' ? '✳' : '↗'}
                      </span>
                      <span className={c.enabled ? 'connected-badge' : 'muted'}>
                        {c.enabled ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                    <h2>{appNames[c.provider]}</h2>
                    <p>
                      {c.provider === 'codex'
                        ? 'Local Codex history with lifecycle events. Native thread link is available as a preview.'
                        : c.provider === 'claude'
                          ? 'Claude Code-format transcripts in configured CLI and Desktop history folders. Desktop surface identification may need verification.'
                          : 'Local Agent transcripts. Exact navigation to an existing IDE chat is not verified.'}
                    </p>
                    <div className="connection-facts">
                      <span>
                        Local sources<strong>{c.roots.length ? 'Found' : 'Not found'}</strong>
                      </span>
                      <span>
                        Observed sessions<strong>{c.found}</strong>
                      </span>
                      <span>
                        Chat opening
                        <strong>
                          {c.provider === 'codex' ? 'Preview link' : 'Copy session ID'}
                        </strong>
                      </span>
                      <span>
                        Last scan<strong>{c.lastScan ? ago(c.lastScan) : 'Not scanned'}</strong>
                      </span>
                    </div>
                    {c.error && <p className="fail">{c.error}</p>}
                    <button
                      className={c.enabled ? 'secondary full' : 'primary full'}
                      disabled={busy || (!c.enabled && !c.roots.length)}
                      onClick={() =>
                        act(async () => {
                          await api('/connections', { provider: c.provider, enabled: !c.enabled });
                          setToast(
                            c.enabled
                              ? 'Collection paused. Existing observations are preserved.'
                              : 'Local history connected.',
                          );
                        })
                      }
                    >
                      {c.enabled ? 'Pause collection' : 'Connect local history'}
                      <ArrowRight size={16} />
                    </button>
                    <details>
                      <summary>Source locations</summary>
                      {c.roots.map((r: string) => (
                        <code key={r}>{r}</code>
                      ))}
                    </details>
                  </section>
                ))}
              </div>
              <section className="plain-panel">
                <h2>More precise live state</h2>
                <p>
                  The included hook bridge can report waiting-for-approval and turn events. Generate
                  its configuration with the CLI, review it, and merge it into your existing app
                  settings. Existing hooks and enforcement rules should be preserved.
                </p>
                <code>node --experimental-strip-types src/cli.ts hooks codex</code>
                <p className="muted">No hook configurations have been changed by this app.</p>
              </section>
            </>
          )}
          {page === 'rules' && (
            <>
              <PageHeading
                eyebrow="EVIDENCE BEFORE ACCEPTANCE"
                title="Rule checks"
                description="Enforce specific checks where the software controls the decision."
              />
              <div className="rule-banner">
                <ShieldCheck size={32} />
                <div>
                  <h2>Required checks cannot be skipped in the lab.</h2>
                  <p>
                    Missing output, unknown check types, and failed required checks block candidate
                    eligibility. This is a bounded guarantee about the lab’s decision, not a
                    guarantee about every action an external agent takes.
                  </p>
                </div>
              </div>
              <div className="rule-grid">
                {[
                  [
                    'Enforced in the lab',
                    'Required artifact checks',
                    'Frozen evaluation policy',
                    'Training / holdout separation',
                    'Model-call budget',
                    'No automatic skill replacement',
                  ],
                  [
                    'Observed in sessions',
                    'Agent activity and freshness',
                    'Explicit checklist items',
                    'Human review and acceptance',
                    'Corrections linked to skills',
                    'Source messages for context',
                  ],
                  [
                    'Needs separate integration',
                    'Native tool-use blocking',
                    'Work skills-index enforcement',
                    'Organization-managed policies',
                    'Semantic rule interpretation',
                    'Native agent sandbox controls',
                  ],
                ].map((group, i) => (
                  <section className="plain-panel" key={group[0]}>
                    <span className={`rule-icon level-${i}`}>
                      {i === 0 ? <LockKeyhole /> : i === 1 ? <Radio /> : <Link2 />}
                    </span>
                    <h2>{group[0]}</h2>
                    <ul>
                      {group.slice(1).map((v) => (
                        <li key={v}>
                          <Check size={15} />
                          {v}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              <section className="plain-panel">
                <h2>Your existing enforcement scripts</h2>
                <p>
                  This app does not edit skill indexes, AGENTS.md files, native permission settings,
                  or enforcement hooks. Existing work scripts can be evaluated as a separate adapter
                  once their code and blocking behavior are available.
                </p>
                <p>
                  A catalog helps an agent discover rules. A validator can check results. A blocking
                  hook can prevent specific actions. Those are distinct capabilities.
                </p>
              </section>
            </>
          )}
        </main>
      </div>
      {selected && (
        <SessionDrawer
          key={selected.id}
          session={selected}
          onClose={() => setSelected(null)}
          onAction={(data) =>
            act(async () => {
              await api('/session', { id: selected.id, ...data });
              setSelected(await api('/session/' + encodeURIComponent(selected.id)));
              setToast('Saved locally.');
            })
          }
        />
      )}
      {modelConfirm && suite && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="model-confirm-title"
          >
            <h2 id="model-confirm-title">Review this model run</h2>
            <p>
              Send <strong>{suite.name}</strong>{' '}
              {modelAction === 'synthesize'
                ? 'training request and required checks'
                : `skill text and ${suite.cases.length} requests`}{' '}
              to <strong>{state.model.endpoint}</strong> using {state.model.model}.
            </p>
            {modelAction === 'synthesize' ? (
              <p>
                One model call creates two synthetic training variants in a new suite. Holdout
                requests are not sent. Check definitions are copied unchanged from the source
                training case.
              </p>
            ) : (
              <p>
                Up to two candidates use training evidence only. The selected candidate is checked
                on holdout cases once. This batch allows up to{' '}
                {suite.cases.length +
                  suite.cases.filter((c) => c.split === 'holdout').length +
                  2 * (1 + suite.cases.filter((c) => c.split === 'train').length)}{' '}
                calls.
              </p>
            )}
            <p>Provider charges may apply. The original skill and suite stay unchanged.</p>
            <div className="modal-actions">
              <button className="secondary" onClick={() => setModelConfirm(false)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    if (modelAction === 'synthesize') {
                      setSuite(await api('/synthesize', { suiteId: suite.id, approved: true }));
                      setReport(null);
                    } else
                      await api('/model-run', { suiteId: suite.id, propose: true, approved: true });
                    setModelConfirm(false);
                  })
                }
              >
                Approve this batch
                <ArrowRight size={16} />
              </button>
            </div>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <div className="eyebrow">{eyebrow}</div>
      <h1>
        {title}
        <span className="heading-dot">.</span>
      </h1>
      <p>{description}</p>
    </div>
  );
}
function SessionDrawer({
  session: s,
  onClose,
  onAction,
}: {
  session: Session;
  onClose: () => void;
  onAction: (data: any) => void;
}) {
  const [feedback, setFeedback] = useState(false),
    [note, setNote] = useState(''),
    [skill, setSkill] = useState(s.skill ?? ''),
    [category, setCategory] = useState('Layout'),
    [goal, setGoal] = useState(s.pinnedGoal ?? s.goal),
    [editing, setEditing] = useState(false),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    setGoal(s.pinnedGoal ?? s.goal);
    setSkill(s.skill ?? '');
    setNote('');
    setFeedback(false);
    setEditing(false);
  }, [s.id]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);
  const runtime = s.runtime;
  const href = nativeThreadHref(s);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-top">
          <span>
            {appNames[s.provider]} <span className="muted">/ {s.project}</span>
          </span>
          <button className="icon-button" aria-label="Close session" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <span className={`status ${runtime}`}>
          <span />
          {labels[runtime]}
        </span>
        {s.attention && (
          <div className="drawer-attention">
            <Flag size={20} />
            <div>
              <strong>{s.attention.label}</strong>
              <p>{s.attention.detail}</p>
            </div>
          </div>
        )}
        <h2 id="session-title">{s.title}</h2>
        <div className="drawer-meta">
          <Clock3 size={14} />
          {ago(s.updatedAt)} · {s.model}
        </div>
        <div className="drawer-actions">
          {href ? (
            <a className="primary" href={href}>
              Open Codex chat
              <ExternalLink size={15} />
            </a>
          ) : (
            <button
              className="secondary"
              onClick={async () => {
                await navigator.clipboard.writeText(s.sourceId);
                setCopied(true);
              }}
            >
              <Copy size={15} />
              {copied ? 'Session ID copied' : 'Copy session ID'}
            </button>
          )}
          <button className="secondary" onClick={() => onAction({ action: 'review' })}>
            <Check size={15} />
            Mark reviewed
          </button>
        </div>
        <p className="navigation-note">
          {href
            ? 'Preview navigation: route verified in installed app code; native click-through not verified.'
            : s.provenance === 'demo'
              ? 'Synthetic session: no native chat exists.'
              : 'Exact native-chat navigation is not available for this connector yet.'}
        </p>
        <CommandComposer session={s} />
        <section className="drawer-section">
          <div className="section-row">
            <h3>
              <Target size={17} />
              Overall goal
            </h3>
            <button className="text-button" onClick={() => setEditing(!editing)}>
              {editing ? 'Cancel' : 'Edit & pin'}
            </button>
          </div>
          {editing ? (
            <>
              <textarea
                aria-label="Pinned goal"
                value={goal}
                maxLength={2000}
                onChange={(e) => setGoal(e.target.value)}
              />
              <button
                className="small-button"
                onClick={() => {
                  onAction({ action: 'goal', goal });
                  setEditing(false);
                }}
              >
                Save goal
              </button>
            </>
          ) : (
            <p>{s.pinnedGoal || s.goal || 'Not observed yet.'}</p>
          )}
        </section>
        <section className="drawer-section">
          <h3>
            <Activity size={17} />
            Latest update
          </h3>
          <p className="preserve-lines">{s.latest || 'No assistant update observed.'}</p>
        </section>
        <section className="drawer-section">
          <h3>
            <CheckCheck size={17} />
            Explicit task checklist
          </h3>
          {s.tasks.length ? (
            <ul className="task-list">
              {s.tasks.map((t, i) => (
                <li key={i} className={t.state === 'completed' ? 'done' : ''}>
                  {t.state === 'completed' ? <Check size={16} /> : <Circle size={16} />}
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              No explicit checklist was found in the observed context. Future tasks are not guessed.
            </p>
          )}
        </section>
        <section className="drawer-section">
          <div className="section-row">
            <h3>
              <MessageSquare size={17} />
              Source evidence
            </h3>
            <span className="muted">{s.messages.length} excerpts</span>
          </div>
          {s.truncated && (
            <p className="notice">
              Large transcript: only the beginning and recent history were read.
            </p>
          )}
          <div className="messages">
            {s.messages.slice(-8).map((m, i) => (
              <details key={m.id + ':' + i}>
                <summary>
                  <span>{m.role === 'user' ? 'You' : 'Agent'}</span>
                  {m.text.slice(0, 85)}
                  <ChevronRight size={13} />
                </summary>
                <pre>{m.text}</pre>
              </details>
            ))}
          </div>
        </section>
        <section className="feedback">
          <button className="text-button" onClick={() => setFeedback(!feedback)}>
            <Sparkles size={17} />
            Flag a repeated correction
            <Plus size={16} />
          </button>
          {feedback && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onAction({ action: 'correction', category, note, skill });
                setFeedback(false);
              }}
            >
              <label>
                Skill and revision
                <input
                  required
                  value={skill}
                  placeholder="html-report@v1"
                  maxLength={200}
                  onChange={(e) => setSkill(e.target.value)}
                />
              </label>
              <label>
                Category
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {['Layout', 'Accuracy', 'Missing requirement', 'Formatting', 'Other'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                What needed another pass?
                <textarea
                  required
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button className="primary">
                Save correction
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </section>
        <div className="drawer-footer">
          <span>Human acceptance stays separate from agent activity.</span>
          <button
            className="primary"
            disabled={['working', 'waiting_approval', 'error'].includes(runtime)}
            onClick={() => onAction({ action: 'accept' })}
          >
            <CheckCheck size={16} />
            Accept result
          </button>
        </div>
      </aside>
    </div>
  );
}
function ReportView({ report: r }: { report: Report }) {
  const [preview, setPreview] = useState<string | null>(null);
  const baseline = r.results.filter((x) => x.variant === 'baseline'),
    candidate = r.results.filter((x) => x.variant === 'candidate');
  const safePreview = (html: string) =>
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'">${html}`;
  return (
    <section className="report">
      <div className="section-row">
        <h2>
          <ShieldCheck size={20} />
          Evaluation result
        </h2>
        <button className="small-button" onClick={() => download(`evaluation-${r.id}.json`, r)}>
          Export evidence
          <ArrowDownToLine size={15} />
        </button>
      </div>
      <div className="report-summary">
        <div>
          <span>BASELINE</span>
          <strong>
            {baseline.filter((x) => x.passed).length}
            <small> / {baseline.length}</small>
          </strong>
          <p>cases pass required checks</p>
        </div>
        <ArrowRight size={24} />
        <div>
          <span>CANDIDATE</span>
          <strong>
            {candidate.filter((x) => x.passed).length}
            <small> / {candidate.length}</small>
          </strong>
          <p>cases pass required checks</p>
        </div>
        <div className="report-verdict">
          <span className={r.eligible ? 'pass' : 'fail'}>
            {r.eligible ? <ShieldCheck size={20} /> : <CircleAlert size={20} />}{' '}
            {r.eligible ? 'Required checks passed' : 'Not ready'}
          </span>
          <p>
            {r.eligible
              ? 'Visual quality, factual correctness, and human acceptance still need review.'
              : r.reasons.join(' ')}
          </p>
        </div>
      </div>
      <p className="report-kind">
        {r.kind === 'artifact-check'
          ? 'Saved-artifact check · No model calls were made.'
          : 'Model API evaluation · ' + r.calls + ' calls · ' + r.model}{' '}
        · Native harness behavior and human correction counts are not measured by this run.
      </p>
      <div className="checks-grid">
        {candidate.map((result) => (
          <section key={result.caseId}>
            <div className="section-row">
              <h3>{result.caseId}</h3>
              <span className={`split ${result.split}`}>{result.split}</span>
            </div>
            {result.checks.map((c) => (
              <div className="check-row" key={c.id}>
                <span className={c.pass ? 'pass' : 'fail'}>
                  {c.pass ? <Check size={16} /> : <X size={16} />}
                </span>
                <span>
                  {c.label}
                  <small>{c.detail}</small>
                </span>
                {c.required && <LockKeyhole size={12} />}
              </div>
            ))}
            <div className="artifact-buttons">
              <button
                className="small-button"
                onClick={() =>
                  setPreview(baseline.find((b) => b.caseId === result.caseId)?.output ?? '')
                }
              >
                View baseline
              </button>
              <button className="small-button" onClick={() => setPreview(result.output)}>
                View candidate
              </button>
            </div>
          </section>
        ))}
      </div>
      <details className="hashes">
        <summary>Reproducibility evidence</summary>
        <p>
          Baseline: <code>{r.baselineHash}</code>
        </p>
        <p>
          Candidate: <code>{r.candidateHash}</code>
        </p>
        <p>
          Policy: <code>{r.policyHash}</code>
        </p>
      </details>
      {preview !== null && (
        <div className="modal-backdrop">
          <section
            className="preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Artifact preview"
          >
            <div className="section-row">
              <h3>Isolated artifact preview</h3>
              <button
                className="icon-button"
                aria-label="Close preview"
                onClick={() => setPreview(null)}
              >
                <X size={21} />
              </button>
            </div>
            <p>Scripts, forms, and external resources are disabled.</p>
            <iframe title="Generated HTML artifact" sandbox="" srcDoc={safePreview(preview)} />
          </section>
        </div>
      )}
    </section>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
