# Observatory Switchboard

A standalone local review board for coding-agent sessions, with a bounded skill evaluation lab. No Mission Control, Observatory repository, cloud account, or hosted database is required.

**Status: working v0.1 preview.** Local history collection, review workflows, deterministic HTML checks, and model API evaluation are implemented. This is not yet a certified universal native-chat switcher or a guarantee that external agents obey every rule.

## Run locally

Use Node.js 22.18 or newer. This revision was exercised on macOS with Node 26.7.0; CI also targets Node 22 and 24.

```sh
git clone https://github.com/fulks89-hub/observatory-switchboard.git
cd observatory-switchboard
npm ci --ignore-scripts
npm run verify
npm start
```

Open **http://127.0.0.1:4318**. The app listens only on loopback. Choose **Explore demo** for fictional examples, or **Connections** to opt into local history collection. Recent sessions covers the last 48 hours; All history exposes older observations. Stop the foreground server with Ctrl+C.

To try the example without connecting any sources:

```sh
npm run demo
```

Open the printed URL ending in `?demo=1`. There is no automatic login startup service. A different port can be supplied through `PORT`. `OBSERVATORY_DATA_DIR` changes the private data directory, which defaults to `~/.session-observatory`.

## Prove it in your native apps

Use the ready-to-paste [Cursor IDE proof prompt](docs/proof-prompts/cursor.md) or [Claude Desktop Code proof prompt](docs/proof-prompts/claude-desktop-code.md). They separate fixture checks from evidence gathered in the actual application, including five simultaneous sessions and exact-chat navigation.

The product is now **Observatory Switchboard**. Existing installations retain the `session-observatory` command alias, `OBSERVATORY_DATA_DIR` setting, and `~/.session-observatory` data directory for compatibility. The name does not introduce a dependency on Brett's Observatory.

## What works

- Local adapters for Codex JSONL, Claude Code JSONL, and Cursor Agent JSONL/text histories, plus an optional hook inbox.
- Goals and latest updates as labeled local excerpts; user-pinned goals; source-message evidence.
- Explicit Markdown checklists and supported structured plan events, with pending/in-progress/completed states.
- A blue-forward board with prominent waiting-on-you flags. Explicit input/approval events, inferred reply requests, and stale evidence are labeled separately. Review and human acceptance are stored separately.
- A Usage & skills tab with recorded token totals, cache reuse, history coverage, tool calls, skill invocation/reference evidence, and human-recorded corrections. Missing usage stays unknown; these are not account quotas or billing totals.
- A follow-up composer with delivery receipts for eligible idle Codex conversations through the local CLI. Claude and Cursor currently support draft/copy only.
- Human-recorded corrections grouped by skill revision and category. Local heuristics also suggest potential corrections for review.
- Immutable imported evaluation suites, baseline/candidate comparison, required HTML checks, and JSON evidence export.
- Optional model-backed synthetic training cases and a bounded, training-only candidate revision loop. The chosen candidate is evaluated on holdout cases once.
- OpenAI-compatible and Anthropic Messages API transports. Model calls need explicit batch approval and obey a configured call cap.
- A Promptfoo configuration draft exporter. It does not claim to export all structural checks or a configured native agent harness.

## Compatibility and honest limits

| Integration | History                                                     | Live state                                                            | Open original chat                                                                                              |
| ----------- | ----------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Codex       | Read-only local adapter exercised on real histories         | Recorded lifecycle events; hooks improve precision                    | `codex://threads/<id>` found in installed desktop handler. Preview link; native click-through was not verified. |
| Claude Code | CLI format tested with fixtures; Desktop directory detected | Hook adapter implemented; live Desktop event flow still needs testing | Not verified. Copy the source session ID.                                                                       |
| Cursor      | Local Agent histories exercised on real data                | Available transcript turn markers; optional hook adapter              | Not verified. Copy the source session ID.                                                                       |

Claude's `local-agent-mode-sessions` folder is intentionally excluded: a discovered transcript there identified a different local-agent surface. The app must not count it as verified Claude Code coverage. Ordinary Claude Chat/Cowork, remote machines, and subagent aggregation are not certified in v0.1.

No native hook settings are modified automatically. Histories are capped at the most recently modified 120 files per provider per scan. Large files use an initial segment plus a recent tail and are explicitly marked incomplete. Stale activity becomes unknown; absence of fresh events cannot prove a session is still running.

The skill lab currently evaluates **skill text and HTML output** through a model API. It does not run full skill bundles inside Codex, Claude Code, or Cursor. Scripts, reference files, browser layout checks, visual judging, real human correction counts, and native-harness backtests require further integration. API results must not be presented as native-app certification. GEPA is not installed; the initial bounded proposal loop is implemented directly so the baseline can be measured before adding another optimizer.

## Follow-ups and historical insights

Open a session to draft a follow-up. Codex sending requires an installed `codex` on PATH (or an absolute `OBS_CODEX_BIN`), a valid existing conversation ID and project directory, and confirmation that the native conversation is idle. The app runs `codex exec --sandbox read-only --json resume <id> -`, passing the prompt on stdin. This is a CLI continuation, not live control of the desktop chat. Running turns and input/approval requests must be handled in the native app. No hooks or enforcement settings are changed. Existing configured native tools retain their own permission boundaries.

The resumed context and prompt are handled by the configured Codex provider under its existing account and usage terms. The app stores prompts and bounded responses in the private profile. Repeated requests use an idempotency key; completion requires matching conversation acknowledgment and a completed-turn event. A failed or interrupted receipt can still mean delivery occurred, so check native history before resending. Runs have a ten-minute limit, not a token or dollar budget. This path has automated fixture coverage but has not been exercised against a live provider.

Usage & skills filters by a session’s last activity, not the date each token was consumed. Codex cumulative usage records are deduplicated; Claude message usage is merged by message identity. Partial transcripts remain partial. A last-recorded model is not a per-model usage allocation. Skill tool invocations and file references are distinguished; neither proves compliance, per-skill token cost, or causal efficiency. Correction and acceptance metrics require human-recorded evidence.

## Skill lab

Open **Skill lab → Open the sample suite → Check saved artifacts**. The sample has deliberately weak baseline artifacts and stronger candidate artifacts. It demonstrates checker behavior only; it is not evidence that a model improved.

Export the example format or generate a local template:

```sh
node bin/observatory.mjs example > my-suite.json
```

The default local suite, Promptfoo draft, evaluation exports, and `local-suites/` directory are ignored by Git. Keep private requests and skill text in these local paths and review staged files before publishing.

Edit its ID, name, baseline skill text, candidate text, and cases. Each case requires a unique ID, initial request, training/holdout split, and at least one required check. Use a `familyId` for related requests; a family cannot cross splits. Keep synthetic variants in their source family's split. Import through the UI or evaluate saved outputs from the command line:

```sh
node bin/observatory.mjs evaluate my-suite.json
node bin/observatory.mjs promptfoo my-suite.json > promptfoo-draft.json
```

Supported checks are `html_title`, `html_lang`, `viewport`, `image_alt`, `contains`, and `not_contains`. Missing outputs fail required checks. HTML is parsed as data; the preview disables scripts, forms, and external resources. A viewport declaration alone does not prove responsive layout, and an alt attribute does not prove good alternative text.

Imported suites cannot overwrite an existing suite ID. New candidates and synthetic suites get new IDs. Evaluation reports contain skill and policy hashes, per-case evidence, and the model/call count when applicable. Neither a successful check nor a report replaces a skill file or approves deployment.

## Optional model access

The app makes **no model calls by default**. It does not search native applications for credentials. Supply an approved model and complete endpoint URL through the launching environment:

```sh
export OBS_MODEL_KIND=openai-compatible
export OBS_MODEL_ENDPOINT=https://api.openai.com/v1/chat/completions
export OBS_MODEL_NAME=YOUR_APPROVED_MODEL
export OBS_MODEL_MAX_CALLS=12
# Supply OBS_MODEL_API_KEY through your normal secure environment mechanism.
npm start
```

These variables are read from the process environment; `.env` files are not loaded automatically. For Anthropic, use `OBS_MODEL_KIND=anthropic` and the complete Messages endpoint. A local OpenAI-compatible endpoint can use loopback HTTP. Other endpoints require HTTPS; redirects and credentials embedded in URLs are rejected. Configure only a destination authorized to receive the selected work content.

The UI displays the destination, data scope, and maximum batch calls before approval. The optimizer proposes at most two candidates by default, selects using training checks, stops early when required training checks pass, and then evaluates holdout once. The call cap is a count limit, **not a dollar guarantee**. Provider billing and native subscriptions are distinct. There is no automatic purchase, capacity increase, or unbounded retry.

To run a reviewed suite through the same engine from a terminal:

```sh
node bin/observatory.mjs optimize my-suite.json --approve-model-transfer
```

## Hook bridge

```sh
node bin/observatory.mjs doctor
node bin/observatory.mjs hooks codex
node bin/observatory.mjs hooks claude
node bin/observatory.mjs hooks cursor
```

The `hooks` command **prints a fragment**. Review and merge it with your existing configuration using the native application's documented trust workflow. Do not replace an existing hooks object wholesale. The generated paths identify this installation, so regenerate them after moving it. POSIX command quoting is currently implemented; native Windows hook installation is not certified.

The bridge writes small local observation files and emits no model context, stdout, or permission decision. It exits promptly even when collection fails. Enable that provider in Connections for observations to be consumed. This bridge is a monitor, not a replacement for blocking enforcement hooks. See [enforcement boundaries](docs/enforcement.md).

## Data and distribution

Session observations, follow-up prompts and receipts, user feedback, suites, and reports live in the private local SQLite database outside the repository. Newly created application data directories use restricted filesystem permissions. This is not application-level encryption; use appropriate device protection for work data. Pausing a connection preserves observations. The API also supports explicitly forgetting a provider's collected sessions; source transcripts are never deleted.

Exported reports and Promptfoo drafts can contain full outputs, prompts, or skill text. The transcript token filter is best-effort and does not anonymize all personal or confidential content. Review exports before sharing. See [privacy boundaries and publication audit](docs/privacy.md).

The server checks Host, Origin, session cookies, and same-origin JSON mutations. Do not expose the port through a tunnel or bind it to a public interface. Summaries/correction heuristics do not have tools, and model-generated HTML never executes on the host.

The source is suitable for a clean GitHub repository: it contains application code, synthetic examples, tests, and documentation. Do not commit the data directory, real evaluation suites, work skills, credentials, or private transcripts. Publish only after reviewing the repository's destination and visibility. Installing from a GitHub checkout follows the same three commands above; no publishing service or Observatory setup is involved.

## Verification

`npm run verify` typechecks, builds the UI, and runs the test suite. Tests cover token deduplication, waiting flags, command destination/receipt guards, a local CLI process fixture, parsers, plan states, correction signals, collector enrollment, review persistence, HTTP access boundaries, fail-closed checks, regression rejection, model budgets, holdout isolation, and synthetic-family handling. Tests use a local mock model server and incur no provider charges.

See [architecture](docs/architecture.md) and [remaining integration work](docs/remaining-work.md). MIT license applies to this project's original code; third-party dependencies retain their own licenses.
