import { Commands, commandCapability } from './commands.ts';
import { sessionAttention } from './attention.ts';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { Store } from './store.ts';
import { Collector, providers } from './collector.ts';
import { effectiveRuntime, correctionSignals } from './normalize.ts';
import { nativeThreadHref } from './navigation.ts';
import {
  evaluateArtifacts,
  validateSuite,
  runModels,
  promptfooConfig,
  synthesizeSuite,
  type ModelConfig,
} from './lab.ts';
import { seedDemo, exampleSuite } from './demo.ts';
import type { Provider } from './types.ts';
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export async function createApp(
  options: {
    dataDir?: string;
    port?: number;
    demo?: boolean;
    modelConfig?: ModelConfig | null;
  } = {},
) {
  const dataDir = resolve(
    options.dataDir ?? process.env.OBSERVATORY_DATA_DIR ?? join(homedir(), '.session-observatory'),
  );
  const db = new Store(join(dataDir, 'sessions.sqlite'));
  seedDemo(db);
  if (!db.suite('html-report-example')) db.saveSuite(exampleSuite());
  const collector = new Collector(db, dataDir);
  const commands = new Commands(db);
  let origin = '';
  const token = randomBytes(32).toString('hex');
  let job: any = null;
  const model: ModelConfig | null =
    options.modelConfig !== undefined
      ? options.modelConfig
      : process.env.OBS_MODEL_ENDPOINT && process.env.OBS_MODEL_NAME
        ? {
            kind: process.env.OBS_MODEL_KIND === 'anthropic' ? 'anthropic' : 'openai-compatible',
            endpoint: process.env.OBS_MODEL_ENDPOINT,
            model: process.env.OBS_MODEL_NAME,
            apiKey: process.env.OBS_MODEL_API_KEY,
            maxCalls: Math.max(1, Math.min(100, Number(process.env.OBS_MODEL_MAX_CALLS) || 12)),
          }
        : null;
  const json = (res: ServerResponse, status: number, data: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  const body = async (req: IncomingMessage) => {
    let s = '';
    for await (const chunk of req) {
      s += chunk;
      if (Buffer.byteLength(s) > 1024 * 1024) throw new Error('Request exceeds 1 MB.');
    }
    return JSON.parse(s || '{}');
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    if (req.headers.host !== new URL(origin).host)
      return json(res, 403, { error: 'Unrecognized host.' });
    if (req.headers.origin && req.headers.origin !== origin)
      return json(res, 403, { error: 'Cross-origin requests are not allowed.' });
    const url = new URL(req.url ?? '/', origin);
    const path = url.pathname;
    if (path.startsWith('/api/')) {
      const cookie = req.headers.cookie
        ?.split(';')
        .map((x) => x.trim())
        .includes(`obs_session=${token}`);
      if (!cookie) return json(res, 401, { error: 'Open the local app to establish a session.' });
      if (
        req.method !== 'GET' &&
        (req.headers.origin !== origin ||
          !req.headers['content-type']?.startsWith('application/json'))
      )
        return json(res, 403, { error: 'A same-origin JSON request is required.' });
      try {
        if (req.method === 'GET' && path === '/api/state') {
          const demo = url.searchParams.get('demo') === '1';
          const sessions = db.sessions(demo).map((s) => ({
            ...s,
            messages: undefined,
            sourcePath: undefined,
            runtime: effectiveRuntime(s),
            attention: sessionAttention(s),
            nativeHref: nativeThreadHref(s),
          }));
          return json(res, 200, {
            sessions,
            connections: collector.connections(),
            opportunities: db.opportunities(demo),
            suggestions: correctionSignals(db.sessions(demo)),
            suites: db.suites().map((s) => ({ id: s.id, name: s.name, cases: s.cases.length })),
            reports: db
              .reports()
              .map((r) => ({ ...r, results: r.results.map((x) => ({ ...x, output: undefined })) })),
            job,
            model: model
              ? {
                  kind: model.kind,
                  endpoint: new URL(model.endpoint).origin,
                  model: model.model,
                  maxCalls: model.maxCalls,
                }
              : null,
            defaultDemo: options.demo ?? false,
          });
        }
        if (req.method === 'GET' && path.startsWith('/api/session/')) {
          const s = db.get(decodeURIComponent(path.slice(13)));
          return s
            ? json(res, 200, {
                ...s,
                runtime: effectiveRuntime(s),
                attention: sessionAttention(s),
                commandCapability: commandCapability(s, commands.binary),
                commands: commands.list(s.id),
              })
            : json(res, 404, { error: 'Session not found.' });
        }
        if (req.method === 'POST' && path === '/api/commands') {
          const data = await body(req);
          const session = typeof data.sessionId === 'string' ? db.get(data.sessionId) : undefined;
          if (!session) throw new Error('Session not found.');
          const result = commands.send(session, data);
          return json(res, 202, result);
        }
        if (req.method === 'POST' && path === '/api/connections') {
          const data = await body(req);
          if (!providers.includes(data.provider) || typeof data.enabled !== 'boolean')
            throw new Error('Invalid connection.');
          if (!data.enabled && data.forget === true) {
            if (
              db
                .sessions(false)
                .some((s) => s.provider === data.provider && commands.active.has(s.id))
            )
              throw new Error('Wait for running follow-ups before forgetting this provider.');
            db.forget(data.provider);
            collector.fingerprints.clear();
          }
          db.set(`enabled:${data.provider}`, data.enabled);
          await collector.scan();
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && path === '/api/scan') {
          await collector.scan();
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && path === '/api/session') {
          const data = await body(req);
          if (typeof data.id !== 'string') throw new Error('Missing session.');
          const s = db.get(data.id);
          if (!s) throw new Error('Session not found.');
          if (data.action === 'review') db.patch(data.id, { reviewedAt: new Date().toISOString() });
          else if (data.action === 'accept') {
            if (['working', 'waiting_approval', 'error'].includes(effectiveRuntime(s)))
              throw new Error('Resolve active work, errors, or pending approval before accepting.');
            db.patch(data.id, {
              reviewedAt: new Date().toISOString(),
              acceptedAt: new Date().toISOString(),
            });
          } else if (
            data.action === 'goal' &&
            typeof data.goal === 'string' &&
            data.goal.length <= 2000
          )
            db.patch(data.id, { pinnedGoal: data.goal });
          else if (
            data.action === 'correction' &&
            typeof data.note === 'string' &&
            data.note.trim() &&
            data.note.length <= 2000 &&
            typeof data.skill === 'string' &&
            data.skill.trim() &&
            data.skill.length <= 200 &&
            ['Layout', 'Accuracy', 'Missing requirement', 'Formatting', 'Other'].includes(
              data.category,
            )
          )
            db.correction(data.id, data.category, data.note, data.skill);
          else throw new Error('Invalid session action.');
          return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && path.startsWith('/api/suite/')) {
          const s = db.suite(path.slice(11));
          return s ? json(res, 200, s) : json(res, 404, { error: 'Suite not found.' });
        }
        if (req.method === 'POST' && path === '/api/suites') {
          const s = await body(req);
          validateSuite(s);
          if (db.suite(s.id))
            throw new Error(
              'Choose a new suite ID to preserve the existing baseline and its reports.',
            );
          db.saveSuite(s);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && path === '/api/evaluate') {
          const data = await body(req);
          const s = db.suite(data.suiteId);
          if (!s) throw new Error('Suite not found.');
          const r = evaluateArtifacts(s);
          db.saveReport(r);
          return json(res, 200, r);
        }
        if (req.method === 'POST' && path === '/api/model-run') {
          if (!model)
            throw new Error(
              'Configure an approved model endpoint before running model evaluations.',
            );
          const data = await body(req);
          if (data.approved !== true)
            throw new Error('Confirm the selected suite and model destination.');
          if (job?.status === 'running') throw new Error('An evaluation is already running.');
          const s = db.suite(data.suiteId);
          if (!s) throw new Error('Suite not found.');
          job = { status: 'running', message: 'Starting bounded evaluation', suiteId: s.id };
          void runModels(
            s,
            model,
            (message) => {
              job.message = message;
            },
            data.propose === true,
          )
            .then(({ suite, report }) => {
              const next = {
                ...suite,
                id: `${s.id.slice(0, 50)}-${report.id.slice(0, 8)}`,
                name: `${s.name} · candidate`,
                revision: report.candidateHash,
              };
              report.suiteId = next.id;
              db.saveSuite(next);
              db.saveReport(report);
              job = {
                status: 'complete',
                message: report.eligible
                  ? 'Required checks passed. Human review is still needed.'
                  : 'Candidate needs further work.',
                reportId: report.id,
              };
            })
            .catch(() => {
              job = {
                status: 'error',
                message:
                  'Evaluation stopped. Check endpoint access, model compatibility, and the call cap. The original suite was preserved.',
              };
            });
          return json(res, 202, { ok: true });
        }
        if (req.method === 'POST' && path === '/api/synthesize') {
          if (!model) throw new Error('Configure an approved model endpoint first.');
          const data = await body(req);
          if (data.approved !== true)
            throw new Error('Confirm the training inputs and model destination.');
          const s = db.suite(data.suiteId);
          if (!s) throw new Error('Suite not found.');
          if (job?.status === 'running') throw new Error('An evaluation is already running.');
          const next = await synthesizeSuite(s, model, 2);
          db.saveSuite(next);
          return json(res, 200, next);
        }
        if (req.method === 'GET' && path.startsWith('/api/report/')) {
          const r = db.reports().find((x) => x.id === path.slice(12));
          return r ? json(res, 200, r) : json(res, 404, { error: 'Report not found.' });
        }
        if (req.method === 'GET' && path.startsWith('/api/promptfoo/')) {
          const s = db.suite(path.slice(15));
          return s
            ? json(res, 200, promptfooConfig(s))
            : json(res, 404, { error: 'Suite not found.' });
        }
        return json(res, 404, { error: 'Not found.' });
      } catch (error) {
        return json(res, 400, {
          error: error instanceof Error ? error.message : 'Request failed.',
        });
      }
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
    try {
      const asset = resolve(
        projectRoot,
        'dist',
        '.' + decodeURIComponent(path === '/' ? '/index.html' : path),
      );
      if (!asset.startsWith(join(projectRoot, 'dist') + '/'))
        return json(res, 403, { error: 'Invalid path.' });
      const contents = await readFile(asset);
      const types: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
      };
      if (path === '/')
        res.setHeader('Set-Cookie', `obs_session=${token}; HttpOnly; SameSite=Strict; Path=/`);
      res.writeHead(200, {
        'Content-Type': types[extname(asset)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(contents);
    } catch {
      return json(res, 404, { error: 'Build the interface with npm run build, then reload.' });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? Number(process.env.PORT ?? 4318), '127.0.0.1', () => resolve());
  });
  const address = server.address();
  origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 4318}`;
  const timer = setInterval(() => {
    void collector.scan();
  }, 4000);
  timer.unref();
  void collector.scan();
  return {
    origin,
    db,
    collector,
    server,
    close: async () => {
      clearInterval(timer);
      commands.close();
      await new Promise<void>((r) => server.close(() => r()));
      while (collector.busy) await new Promise((r) => setTimeout(r, 10));
      db.close();
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp({ demo: process.argv.includes('--demo') });
  console.log(
    `Observatory Switchboard: ${app.origin}${process.argv.includes('--demo') ? '/?demo=1' : ''}\nLocal only. History collection is opt-in in Connections.`,
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void app.close().then(() => process.exit(0));
    });
}
