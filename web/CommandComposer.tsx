import React, { useEffect, useState } from 'react';
import { Send, Copy, Terminal, Check, LoaderCircle } from 'lucide-react';
import type { Session } from '../src/types.ts';
import type { CommandCapability, CommandRecord } from '../src/commands.ts';
type Detail = Session & { commandCapability?: CommandCapability; commands?: CommandRecord[] };
export function CommandComposer({ session: s }: { session: Detail }) {
  const [text, setText] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false),
    [preview, setPreview] = useState(false),
    [records, setRecords] = useState(s.commands ?? []),
    [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const capability = s.commandCapability;
  useEffect(() => {
    setRecords(s.commands ?? []);
  }, [s.commands]);
  useEffect(() => {
    if (!records.some((r) => r.status === 'running')) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch('/api/session/' + encodeURIComponent(s.id));
        if (r.ok) setRecords((await r.json()).commands ?? []);
      } catch {}
    }, 2000);
    return () => clearInterval(timer);
  }, [records.some((r) => r.status === 'running'), s.id]);
  const running = records.some((r) => r.status === 'running');
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: s.id,
          text,
          requestId,
          confirmed,
          expectedUpdatedAt: s.updatedAt,
        }),
      });
      const v = await r.json();
      if (!r.ok) throw Error(v.error ?? 'Unable to send.');
      setRecords([v, ...records.filter((x) => x.id !== v.id)]);
      setText('');
      setConfirmed(false);
      setRequestId(crypto.randomUUID());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="command-composer" aria-label="Send a follow-up">
      <div className="section-row">
        <h3>
          <Terminal size={17} /> Send a follow-up
        </h3>
        <span className="command-route">{s.provider === 'codex' ? 'CODEX CLI' : 'DRAFT'}</span>
      </div>
      <p>Keep the next instruction with the session it belongs to.</p>
      <div className="command-target">
        <span>
          {s.provider} / {s.project}
        </span>
        <code>{s.sourceId}</code>
      </div>
      <textarea
        aria-label="Follow-up message"
        placeholder="Ask for a recap, explain a result, or give the next instruction…"
        value={text}
        maxLength={8000}
        onChange={(e) => {
          setText(e.target.value);
          setConfirmed(false);
          setCopied(false);
          setPreview(false);
          setRequestId(crypto.randomUUID());
        }}
      />
      <p className="command-note">{capability?.reason ?? 'Loading connector capability.'}</p>
      {capability?.available && (
        <>
          <div className="command-scope">
            <strong>Read-only follow-up</strong>
            <span>Project: {s.cwd}</span>
            <span>
              This sends the prompt and resumed context to your configured Codex provider. Usage
              applies. File-editing commands need the native app.
            </span>
          </div>
          <label className="command-confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            I confirm this is the right conversation and it is idle in the native app.
          </label>
        </>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="notice" role="status">
          Demo preview complete. This fictional conversation received no message and no model was
          called.
        </div>
      )}
      <div className="command-actions">
        <button
          className="secondary"
          disabled={!text.trim()}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setError('Clipboard unavailable. Select and copy the draft manually.');
            }
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy draft'}
        </button>
        {s.provenance === 'demo' ? (
          <button className="primary" disabled={!text.trim()} onClick={() => setPreview(true)}>
            <Send size={15} /> Preview send
          </button>
        ) : (
          <button
            className="primary"
            disabled={!capability?.available || !confirmed || !text.trim() || busy || running}
            onClick={() => void send()}
          >
            {busy || running ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}{' '}
            {busy
              ? 'Submitting…'
              : running
                ? 'Follow-up running'
                : s.provider === 'codex'
                  ? 'Send via Codex'
                  : 'Native sending unavailable'}
          </button>
        )}
      </div>
      {records.length > 0 && (
        <div className="command-history">
          <h4>Follow-up receipts</h4>
          {records.map((r) => (
            <details key={r.id} open={r.status === 'running'}>
              <summary>
                <span className={'receipt-state ' + r.status}>{r.status}</span>
                {r.text.slice(0, 70)}
              </summary>
              <p>{r.detail}</p>
              {r.response && <pre>{r.response}</pre>}
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
