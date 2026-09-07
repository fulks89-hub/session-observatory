# Privacy and publication boundaries

The public source and private source repository contain the same sanitized application, documentation, tests, and fictional examples. Neither is a backup of a user's collected sessions or skill lab data. Repository visibility does not change the application's behavior or upload local data.

## What stays on the machine

History collection is opt-in per provider. The app reads local transcript files and stores excerpts, goals, explicit task evidence, session identifiers, project paths, feedback, imported suites, and reports in its local SQLite profile. The default directory is `~/.session-observatory`, outside the source checkout. The optional hook inbox can temporarily contain prompt and assistant text before normalization. No native credential stores are read.

The database is not encrypted by the app. Newly created profile directories use mode 0700 and database files use 0600. Use a dedicated private directory if overriding the default; an existing parent directory is not automatically made private. Device backups may include this data. The loopback server is intended for one trusted local user; it does not protect against malicious software running as that user.

The transcript filter removes some known token formats, not every secret or personal detail. It does not sanitize imported skill suites or model outputs. Treat collected data and exports as confidential until reviewed. Forgetting a provider removes its sessions and feedback from the app's active database; it does not securely erase storage, backups, source transcripts, or independently imported suites and reports.

## What can leave the machine

The app has no telemetry, cloud sync, or automatic session upload. Normal session review and saved-artifact evaluation make no model requests. Optional model runs send the selected skill text and evaluation requests to the endpoint configured by the operator, after UI confirmation or the explicit CLI approval flag. Candidate proposals also send training checks, training outputs, and training feedback. Holdout requests still go to the evaluator model, but are excluded from candidate proposal input. Synthetic generation sends the selected training request and checks.

Model credentials are read from the launching environment and sent only in the configured provider's request headers. Endpoint user/password credentials are rejected, redirects are rejected, and remote endpoints require HTTPS. Use headers rather than putting secrets in URLs. Provider billing, retention, and data handling are governed by that provider and the operator's account configuration.

Exports are deliberate local downloads or CLI output, not automatic anonymization. Evidence JSON can contain full generated artifacts; Promptfoo drafts contain requests and skill text. Shell redirection and browser downloads may create files outside the app's restricted profile permissions. Review their contents and destination before sharing.

## Publication review — September 7, 2026

The initial source history was reviewed with Gitleaks 8.30.1 and a separate metadata/content check for personal filesystem paths, email addresses, private-network URLs, private keys, and sensitive file types. No secrets or private user data were found in the reachable source history. Commit attribution uses the repository owner's GitHub no-reply address. The final source snapshot and history are rescanned before publication.

The release includes only tracked source, documentation, lockfile, tests, and synthetic fixtures. It excludes runtime databases, local transcripts, model configuration, browser captures, private work skills, adjacent research notes, and the local Git object database. Git exclusions cover common credential files and app-generated evaluation/Promptfoo exports. Arbitrarily named private files can still be staged, and Git exclusions can be overridden: always review the staged diff and rerun a secret scan before publishing subsequent changes.

This is a scoped source and data-flow review, not a penetration test or a guarantee that every possible secret pattern is detected. No live user data was uploaded to a model or scanner service during the review; Gitleaks ran locally.
