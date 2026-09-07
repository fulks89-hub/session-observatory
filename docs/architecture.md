# Architecture

The server uses Node HTTP and SQLite. The React interface is built by Vite and served from the same loopback origin. Runtime state and model credentials never enter the Git repository. Optional model access comes from the launching environment, not native application credential stores.

```text
Opted-in histories ───► Collector ───► SQLite ───► Session board
Optional hook inbox ──► Normalizer        │            │
                                        └── Corrections / review evidence

Imported suite ──► Frozen baseline + checks ──► Local artifact evaluation
                            │
                            └── Approved model batch
                                  ├── Training-only candidate proposals
                                  ├── Training selection / early stop
                                  └── Selected candidate evaluated on holdout
                                            │
                                      Immutable report + candidate suite
```

`src/normalize.ts` interprets known event shapes and never executes their contents. `collector.ts` scans only enrolled provider roots, skips symlinks/subagent/tool directories, bounds file reads, and reports unavailable sources. `store.ts` preserves human review/pinned goals during re-import. Derived correction suggestions remain distinct from user-confirmed feedback.

`lab.ts` parses HTML with parse5 and runs declarative checks. Model calls return text only, have no tool definitions, and cannot access arbitrary host files. Training and holdout membership and check definitions are hashed. Imported suites cannot replace existing IDs. A later optimizer or native harness runner should implement this same boundary without gaining access to policy modification.

`server.ts` exposes authenticated same-origin JSON endpoints. Mutations require an exact Origin match and JSON content type. The main document establishes an HttpOnly, SameSite=Strict local session cookie. Host checks protect against DNS rebinding. CSP, sandboxed artifact frames, and disabled external resources separate generated HTML from application authority.

The default local database is a single-machine, single-user profile. A second profile can run with a separate data directory and port. This is not a remotely accessible/team deployment. A future Mission Control embed or Observatory context connector is optional; the running application has no imports, processes, or schema dependencies on either project.

Known bounds: transcript scans are not a complete process inventory; some native states are only available through hooks. Excerpts are not model-generated semantic summaries. Native chat links need application/version-specific proof. Skills with scripts, tools, or resource files require actual harness backtests before their behavior can be certified.
