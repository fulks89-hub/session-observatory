# Remaining integration work

This list preserves the difference between the requested full product and the working v0.1 implementation.

## Native session gate

- Verify the Codex thread preview link with a real native click-through. The installed handler was inspected; the native Codex UI was unavailable to computer-use verification.
- Prove Claude Code Desktop hook delivery and stored-history discovery using an actual Code-tab session. Do not substitute Cowork/local-agent history.
- Establish supported exact-existing-chat navigation for Claude Code Desktop and Cursor. The v0.1 fallback copies the source session ID and is explicitly labeled.
- Verify waiting-for-input/approval, cancellation, app exit, resume, and multiple profiles against real hooks. No native hook settings were installed during the build.
- Add a fuller session identity with machine/profile/parent relationships before implementing multi-machine or subagent aggregation.

## Skill lab gate

- Obtain the authorized real HTML skill bundle and original inputs/accepted examples. No actual work skill was inspected or changed.
- Add Codex, Claude Code, and Cursor harness runners with isolated fixtures, pinned versions, and validated sandbox/network behavior. Model API tests are not a substitute.
- Add browser-rendered checks for overflow, responsive widths, console errors, keyboard behavior, and visual review. Current HTML checks only cover their declared structural/text predicates.
- Capture substantive human correction rounds and active review minutes over real tasks. No evidence yet establishes a one-to-two-round outcome.
- Compare the initial bounded optimizer with GEPA/Promptfoo under an equal evaluation budget before adopting extra infrastructure.
- Evaluate the owner's work enforcement scripts when their source is available, using the matrix in enforcement.md.

## Distribution gate

- Publish the reviewed clean source to the owner's chosen GitHub repository/visibility.
- Exercise installation on a second machine with no Observatory/Mission Control.
- Broaden browser coverage beyond the verified local board, session drawer, sample evaluation, and isolated preview. Desktop screenshots and 390/768-pixel overflow checks passed after recovering an initially detached browser connection. Native application click-through remains a separate unresolved gate.
- Package/sign native installers only after native integration behavior is proven. The current source installation is functional; no signed desktop installer or startup service is supplied.
- Narrated demo: deferred; no narration generated or uploaded in this build.
