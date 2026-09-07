# Rule enforcement boundaries

An index can help an agent find rules. Scripting can make some checks deterministic. Neither establishes that every natural-language instruction is followed in every execution path.

| Mechanism                      | What it establishes                                                                            | What it does not establish                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Skills catalog / routing index | Instructions and skills are discoverable.                                                      | The agent read, understood, or obeyed them.                              |
| Context injection              | Text was supplied at a particular boundary.                                                    | The model will reliably act on it.                                       |
| Read/hash evidence             | A particular file revision was accessed or supplied.                                           | Correct interpretation or compliance.                                    |
| Deterministic validator        | The checked artifact satisfies a precisely defined predicate.                                  | Unchecked semantics, visual quality, or unrelated actions.               |
| Blocking tool hook             | A mediated action cannot proceed unless the hook allows it, subject to the runtime's behavior. | Actions outside the hook's coverage, bypass paths, or semantic judgment. |
| CI / protected release gate    | A protected transition requires configured checks.                                             | Work done outside that protected transition.                             |

## What this app enforces

The skill lab validates check definitions, requires a holdout split and at least one required check per case, rejects task-family leakage, and treats missing outputs as failed evidence. A candidate cannot be eligible when a required check fails or a passing baseline case regresses. The optimizer does not receive holdout cases during proposal generation and cannot change the evaluation policy through its output. Model calls are bounded, imported baselines are preserved, and no automatic skill installation exists.

These are concrete software gates over the lab's own decision. They are not proof of semantic correctness or protection against the machine's owner deliberately modifying the application/database.

Session collection is observational. The generated hook bridge never grants approvals, edits instructions, or blocks native tool calls. Observation failure should not break the user's agent session. Existing blocking/security hooks remain separate and must be preserved when adding the observer.

## Evaluating an existing work enforcement system

Before adopting it, inspect its source and test a small controlled matrix:

1. Identify the actual gate: task routing, skill loading, tool execution, output validation, commit, or release.
2. Specify rules as testable predicates where possible. Separate enforceable checks from subjective instructions.
3. Verify coverage for each application and tool path, including subagents, resumed/compacted sessions, and direct command execution.
4. Intentionally omit a required skill, use an outdated revision, remove a check, and cause validator timeout/error. Record whether the protected action stops.
5. Check whether the proposing agent can rewrite the policy, validator, or expected results. Isolate those from candidate-edit permissions.
6. Test malformed/untrusted transcript content and command arguments. Do not execute commands obtained from a session transcript.
7. Verify normal work still succeeds and determine how to roll back without destroying unrelated settings.

A reviewed external validator could later be registered as a lab check runner. A native blocking hook needs a separate adapter and explicit configuration review. Do not import a work skills index as executable policy merely because it appears in observed session content.

The owner's existing work script was not available during this build and has not been changed or certified. The inspected Observatory catalog and policies did not establish an equivalent universal enforcement mechanism.

Relevant runtime references: [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Cursor hooks](https://prod.cursor.com/docs/hooks).
