# Execution protocol — background agents

How the layered plan (`.agents/plans/map-tab-nextjs-migration.md`) is executed by
background agents, and how comment, naming, and testing hygiene are enforced.

Model for **all** subagents (implementers and reviewers alike):
`opencode-go/deepseek-v4.1-flash#high`. No other variant is used.

## Roles

| Role | Agent | Writes code? | Context |
|---|---|---|---|
| Orchestrator | me (this session) | only commits/branches | full conversation |
| Implementer | background `general` subagent, one per layer | yes | fresh, prompt-supplied |
| Reviewer | background `general` subagent, one per layer | no | fresh, prompt-supplied |
| Explorer | background `explore` subagent | no | fresh, prompt-supplied |

**A background agent never has our conversation.** It has only what its prompt
contains, so every implementer prompt is self-contained (see Context contract).

## Why agents are untrusted by default

Background agents start with zero context about the decisions in this
conversation. They will confidently invent conventions, add compatibility shims,
and write comments that narrate code. Treating their output as a draft — never a
result — is the whole point of this protocol.

## Context contract

Every implementer prompt must contain all of:

1. The plan path and the specific layer, with an instruction to read it.
2. The exact deliverable **and explicit non-goals** (what not to build).
3. Invariants from `AGENTS.md`, restated literally (do not rely on the agent
   having read it):
   - no fallbacks, compatibility shims, or backward-compat layers
   - Tidy First: make the change easy, then make the easy change
   - never delete `.sqlite` files
   - respect the layer boundary
4. The comment, naming, and testing rules (below), restated.
5. The exact files it may touch and the commands it must run.
6. Acceptance criteria in observable terms.
7. Where to write `.agents/implementation-notes/<layer>.md`, including every
   decision not already agreed and a "what to review" section.

## Comment and naming hygiene

Enforcement is layered, because prompt instructions alone are not enough:

- **Prompt:** restate the rule — comments explain what the code cannot: reasons,
  constraints, consequences. No comments that paraphrase the line beneath them.
  Names carry domain meaning; distinguish raw IDs from stable IDs; make units,
  conversion direction, and side effects explicit.
- **Static checks:** `ruff check`, `ruff format --check`, and `ty` must pass
  (`uv run`). Ruff replaces black, flake8, and isort; ty replaces mypy. Nothing
  else runs. Testing is `pytest` only.
- **My diff read:** I read the entire diff and reject comment noise and vague
  names before anything moves forward.
- **Reviewer checklist:** the reviewer is *aggressive* about code comments and
  names, and must cite specific lines.

## Testing hygiene

- **Behavioural only.** Tests assert observable behaviour through public
  interfaces. No snapshot tests, no change-detection, no tests that merely
  restate the implementation.
- **No automating manual verification.** Anything that has to be eyeballed
  (layout, rendering) stays manual and is verified with `playwright-cli`.
- **Tests must be capable of failing.** The implementer states what each test
  would catch; I confirm a test actually exercises the path rather than passing
  vacuously.
- The reviewer audits test intent, not just pass/fail.

## Documentation hygiene

Reference docs (for example `python/batch/FEEDS.md`) describe the **current
state**: what a thing is, its inputs and outputs, and how to operate it. They are
not a record of how we got there.

- Decisions, alternatives considered, corrections, and history belong in
  `.agents/implementation-notes/`, never in a reference doc.
- A reference doc must not read like a diary ("an earlier draft…", "I was
  wrong…", "corrections to earlier notes"). A reader who wants the history reads
  the implementation notes.
- The reviewer rejects reference docs that carry decision narrative, and rejects
  implementation notes that omit decisions.

## My review of every agent

After each agent finishes, before anything else:

1. Read the **entire** `git diff` myself — never accept the agent's summary.
2. Run the checks and tests myself, from the correct directory.
3. Verify the diff against the plan's layer scope and non-goals.
4. Confirm the implementation notes exist and list real decisions.
5. Reject and re-prompt until all of the above hold.

## Per-phase review by a second agent

Only once checks and tests pass **and** my review is clean:

1. Start a **fresh background reviewer** in a new session (never the implementer
   session), handed the layer's diff range, the plan, and the hygiene checklist.
2. Instruct it explicitly that it is **advisory**, and that its mandate is to be
   **aggressive** about:
   - **code comments and names** — flag any comment that narrates the code, and
     any name that is vague or hides units, direction, or side effects;
   - **docs versus implementation notes** — flag reference docs that carry
     decision history, and implementation notes that omit decisions;
   - **testing hygiene** — flag snapshot/change-detection tests, tests that would
     pass vacuously, and any automated test for something that must be verified
     manually;
   - **simplifications and layer-rule violations** — the questions "could this be
     simpler?" and "is this in the right layer?".
   It must **not** propose defensive or over-engineered additions.
3. I adjudicate every finding — accept with a reason, or reject with a reason —
   and record the outcome in the implementation notes.

The reviewer is not authoritative. Its suggestions are inputs, not verdicts.

## Sequencing

`gh stack` produces a **linear** chain, and layers share a working tree, so:

- Implement layers **sequentially**. Never run two write-capable agents at once.
- Use background agents in parallel only for **read-only** work (research, feed
  URL checks, exploring an unfamiliar file).
- Branches and commits are made by me (the orchestrator), not by agents, so the
  stack stays clean.

## Definition of done per layer

A layer is done only when all of these hold:

- static checks pass, tests pass
- I have read the full diff
- a separate reviewer has run and every finding is adjudicated
- implementation notes are written
- the plan file has **not** been edited (changes go in the notes)
- the PR exists on the correct base via `gh stack`
