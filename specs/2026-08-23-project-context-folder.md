# Spec: Project Context Folder
> Spec ID: SPEC-2026-08-23-project-context-folder
> Status: approved
> Supersedes: —
> Superseded-by: —
> Revision: 2026-08-23 — the project-context ceiling is settled (whole documents only, taken in the human's order, skip-and-continue, 32k approximate tokens by default and configurable), which clears the one blocking clarification and makes the spec plannable; the per-skill agent-count question is withdrawn because that count already ships; the review-engine seam is reframed as pre-built scaffolding this feature fills rather than a gap.
> Revision: 2026-08-23 — a researcher sweep corrected the spec's picture of what already exists, and only that: both editors already carry working tab bars, the document-descriptor contract and its client hooks are already written, and the attach/reorder/filter/preview/markdown-edit primitives already ship, so three capabilities are genuinely absent rather than most of the feature. Two researcher questions about the intent of that existing scaffolding were added to Open questions. No acceptance criterion was added, removed, renumbered or reworded.
> Revision: 2026-08-23 — the human answered all seven remaining clarifications, so the spec now carries no open clarification marker at all: `.devdigest/specs/` was a stale label for the selected document's own folder and not a search root (AC-29); a failed save reports and keeps the unsaved text (AC-30); attachments disappear with the repository they came from (AC-31); an attachment belongs to the repository its document came from, so an agent run against another repository carries no project context (AC-32); an empty or non-UTF-8 document is skipped and traced like a missing one (AC-22 widened, the only existing criterion touched); the `code_chunks` enum question is closed as bearing on a non-goal; and the existing `SpecFile` contract is confirmed as the base this feature extends. AC-1…AC-28 are otherwise unchanged.
> Revision: 2026-08-23 — the human accepted the repository-revision proposal and all four design-review proposals, so five criteria were appended: AC-33 (the revision the documents were read at, recorded in the trace), AC-34 (the documents inherited from enabled skills, shown and counted on the agent's `Context` tab), AC-35 (naming the agents that use a document, not only counting them), AC-36 (marking an attachment that can no longer be read, before a run), AC-37 (stating at save time how many agents use the edited document). Contracts, the approximate-token requirement and the provenance note follow those five; `## Design review` now records its four items as accepted rather than proposed; `## Open questions` holds nothing outstanding. AC-1…AC-32 are untouched, and the status stays `draft`.
> Revision: 2026-08-23 — the human replaced M1's footer chunk count with a token total, so one criterion was appended: AC-38 (the number of markdown documents found in the repository and their combined approximate token count). The embedding/chunk-indexing non-goal was corrected rather than dropped — the indexing stays out of scope, the footer line survives reporting tokens. `## Problem and user` now states the reason every token count in this spec exists: the human must see what a choice of documents will cost a run before making it, which AC-16, AC-18 and AC-34 already serve, so no criterion was added for it. The approximate-token requirement, the Contracts note and the message-file copy note were widened to cover the new total and to keep it distinct from the agent tab's. AC-1…AC-37 are untouched, and the status stays `draft`.
> Revision: 2026-08-23 — the human answered the four gaps the spec had left silent, so four criteria were appended: AC-39 (the order the documents are assembled in — the agent's own first, then those inherited from its skills), AC-40 (a skill contributes its documents only while it is enabled and enabled on that agent, in the run and on the tab alike), AC-41 (inherited rows are not draggable), AC-42 (restoring an earlier version of a skill does not change which documents it contributes). The human also decided that this feature adds no access control, recorded under Non-functional requirements. One Edge-cases bullet was corrected rather than added: a skill's documents can no longer displace the agent's own under the ceiling, because AC-39 puts the agent's own first. AC-1…AC-38 are untouched, and the status stays `draft`.
> Revision: 2026-08-23 — the human approved the spec, so the status moves from `draft` to `approved`. Nothing else changed: AC-1…AC-42 are untouched and unrenumbered, `## Open questions` still reports nothing outstanding, and the file carries no unresolved clarification marker.

## Problem and user

A reviewer agent judges a pull request without ever seeing what the project
already decided. The invariants that make a change wrong here — "the `api/`
module does not import `db/` directly", "every cache key carries the API
version prefix" — are written down in the repository, in markdown, and never
reach the review. So the agent reports what is wrong in general and misses
what is wrong *in this project*, and the human reading the findings has no way
to tell whether the agent knew the rule at all.

The user is the human who configures reviewers in the Studio: they know which
documents matter for which agent, and today they have nowhere to say so. This
feature lets them attach documents that already live in the reviewed
repository to an agent or to a skill, has the reviewer read those documents at
run time, and shows in the run trace exactly which documents went in and what
they contained.

Choosing what to attach is choosing what every run of that agent will pay for,
so while the human is picking documents they must be able to see how many
tokens those documents will cost at review run time — before they commit to
the choice, not after a run has already sent them. Every token count this spec
requires exists for that reason.

Selecting the *relevant* documents automatically from the pull request's
content is a separate feature; here the human selects them by hand.

**Design sources.** Referenced below by short label.

| Label | File | Shows |
|---|---|---|
| M1 | `img/Снимок экрана 2026-08-23 в 00.01.37.png` | Project Context page |
| M2 | `img/Снимок экрана 2026-08-23 в 00.05.23.png` | Skill editor › Context, 1 attached |
| M3 | `img/Снимок экрана 2026-08-23 в 00.05.49.png` | Skill editor, document preview drawer |
| M4 | `img/Снимок экрана 2026-08-23 в 00.06.22.png` | Skill editor › Context, 5 attached, SERIALIZES AS |
| M5 | `img/Снимок экрана 2026-08-23 в 00.06.55.png` | Agent editor › Context |
| M6 | `img/Снимок экрана 2026-08-23 в 00.07.05.png` | Agent editor, document preview drawer |
| M7 | `img/Снимок экрана 2026-08-23 в 00.12.18.png` | Run trace: Configuration + Prompt assembly |
| M8 | `img/Снимок экрана 2026-08-23 в 00.12.31.png` | Expanded Project-context block |

## Goals / Non-goals

**Goals**

- Browse and read the repository's markdown documents in the Studio.
- Attach documents by hand to an agent and to a skill, in an order the human
  controls, and see how much prompt they will cost before a run.
- Have a run read the attached documents from the repository and inject their
  text as an untrusted `## Project context` block.
- Show, in the run trace, which documents were read and the exact block that
  was sent.
- Edit a document's text from the Studio and save it back to the repository
  clone on this machine.

**Non-goals**, each with the reason it was ruled out:

- **Automatic selection of relevant documents from the pull request's
  content.** Deferred to its own feature so this one stays small enough to
  answer the question it exists to answer — whether a document changes the
  reviewer's behaviour at all.
- **Embedding or chunk indexing of the documents.** The chunk count in M1's
  `Indexed: 12 files · 1,240 chunks` footer is produced by a different
  subsystem (repo-intel); the human asked for the lightest implementation that
  works. This feature consequently writes nothing to the embedding tables, and
  leaves their existing scaffolding untouched, per the repository's convention
  that an empty table is not dead code. The footer *line* is not ruled out with
  it: it stays, and reports the token total of the repository's documents in
  place of the chunk count (AC-38, human, 2026-08-23).
- **The numeric `COVERAGE 78` ring on M1.** Replaced by a plain count of how
  many agents use the document.
- **Creating or uploading new documents from the Studio** (the `+`, folder and
  upload toolbar icons on M1). Documents are authored in the repository.
- **Committing or pushing an edit back to GitHub.** A write path to GitHub
  needs a write-scoped token, branch selection, commit authorship, conflict
  handling and push-failure handling — more work than the rest of the feature
  combined. A saved edit therefore stays on this machine (see AC-6, AC-7).
- **Creating a new agent or skill version when documents are attached or
  detached.** The human explicitly does not want an attachment to count as a
  change of the agent or the skill itself.

## User stories

- As the human who configures reviewers, I attach a document stating that the
  `api/` module must not import `db/` directly to my Security Reviewer, open a
  pull request that violates it, and read a finding that points at that
  document — which is how I know the attachment did anything at all.
- As the human reading a finished run, I open the trace, see which documents
  the agent read, and expand the exact `## Project context` block that was
  sent, so a surprising finding can be traced to the text that produced it.

## Acceptance criteria (EARS)

### Finding and reading documents

- **AC-1** — The system shall list, for the repository in scope, every
  markdown document found recursively under the configured search roots,
  identified by its repository-relative path.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-2** — WHERE no search roots have been configured, the system shall
  search `specs/`, `docs/` and `insights/`, matching `**/{specs,docs,insights}/**/*.md`.
  *(source: human, 2026-08-23; verify: server-unit)*
- **AC-3** — The system shall show, for every document in every list, both its
  file name and its containing folder, so that two documents sharing a file
  name under different roots stay distinguishable.
  *(source: mockups M2, M4, M5; verify: client)*
- **AC-4** — WHEN the human asks for the document list to be refreshed, the
  system shall re-read the repository and show the list as it now stands on
  disk. *(source: mockup M1; interviewer-derived, unchallenged; verify: client)*
- **AC-5** — WHILE a document is open in Preview on the Project Context page,
  the system shall render its markdown content.
  *(source: mockup M1; verify: client)*
- **AC-6** — WHEN the human saves an edit made in the Project Context page's
  Edit mode, the system shall write the edited text to the repository's copy on
  this machine, without creating a commit and without sending anything to
  GitHub. *(source: human, 2026-08-23; verify: server-integration)*
- **AC-7** — WHILE a document is open in Edit mode, the system shall state that
  a saved change stays on this machine, is lost when the repository is
  resynced, and never reaches GitHub.
  *(source: human, 2026-08-23; verify: client)*
- **AC-8** — The system shall show, for each document, how many agents use it.
  *(source: mockups M1, M3, M6; verify: client)*
- **AC-29** — WHILE a document is selected on the Project Context page, the
  system shall show that document's own containing folder, which is a property
  of the selected document and not a statement of where documents are searched
  for. *(source: mockup M1; human, 2026-08-23; verify: client)*
- **AC-30** — IF saving an edit fails, THEN the system shall report the failure
  and shall leave the human's typed text in the editor unsaved — it is neither
  discarded nor overwritten by a reload of the document from disk, so nothing
  the human wrote is lost. *(source: human, 2026-08-23; verify: client)*
- **AC-35** — WHERE the system shows how many agents use a document (AC-8) —
  on the Project Context page and in the preview drawer — it shall also name
  those agents and shall let the human open each of them.
  *(source: human, 2026-08-23; verify: client)*
- **AC-37** — WHEN the human saves an edit to a document, the system shall state
  how many agents use that document, alongside the statement that the change
  stays on this machine and is lost on the next resync (AC-7).
  *(source: human, 2026-08-23; verify: client)*
- **AC-38** — The Project Context page shall show, for the repository in scope,
  how many markdown documents it found and their combined approximate token
  count; that total is what the repository has available, and is not what any
  one run will send — the total of what a run sends is the agent `Context`
  tab's (AC-18, AC-34). *(source: human, 2026-08-23; verify: client)*

### Attaching, ordering and previewing

- **AC-9** — The agent editor shall carry a `Context` tab listing every
  document of the repository with a control that attaches or detaches it, and a
  count of how many of them are attached.
  *(source: mockup M5; verify: client)*
- **AC-10** — The skill editor shall carry a `Context` tab of the same shape,
  a count of attached documents, and a statement that any agent using this
  skill inherits them. *(source: mockups M2, M4; verify: client)*
- **AC-11** — WHEN the human attaches or detaches a document, the system shall
  record the document's repository-relative path against that agent or skill
  and shall not store the document's text.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-12** — WHEN the human attaches or detaches a document, the system shall
  not create a new version of the agent or of the skill.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-13** — WHEN the human drags an attached document to another position,
  the system shall keep that order and shall use it as the order in which those
  documents appear in the assembled `## Project context` block.
  *(source: human, 2026-08-23; mockup M5; verify: client)*
- **AC-14** — The system shall show attached documents above unattached ones,
  attached in the human's order and unattached grouped by root.
  *(source: mockups M2, M4, M5; verify: client)*
- **AC-15** — WHEN the human types into the document filter, the system shall
  show only the documents that match.
  *(source: mockups M2, M4, M5; verify: client)*
- **AC-16** — WHEN the human opens a document's preview from either Context
  tab, the system shall show its repository-relative path, its root, its
  approximate token count, how many agents use it, its rendered markdown, and a
  control that attaches or detaches it.
  *(source: mockups M3, M6; verify: client)*
- **AC-17** — The skill editor's `Context` tab shall show how the attached
  documents serialize, listing their paths grouped by root under
  `## Project specifications`, `## Project docs` and `## Project insights`.
  *(source: mockup M4; verify: client)*
- **AC-18** — The agent editor's `Context` tab shall show the approximate total
  token count of the attached documents and shall state that they are injected
  as an untrusted `## Project context` block into every run.
  *(source: mockup M5; verify: client)*
- **AC-31** — WHEN a repository is removed from the Studio, the system shall
  remove the attachments made from that repository's documents; adding the
  repository again shall not restore them.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-34** — The agent editor's `Context` tab shall show the documents
  inherited from the agent's enabled skills as well as the documents attached to
  the agent itself, shall distinguish the inherited ones from the agent's own,
  and shall count both in the approximate total (AC-18); a document reaching a
  run through both paths shall be shown once and counted once, at the position
  the agent's order gives it (AC-20).
  *(source: human, 2026-08-23; verify: client)*
- **AC-36** — The agent editor's and the skill editor's `Context` tab shall mark
  an attached document that can no longer be read — because it is not there,
  because it is empty, or because it is not valid UTF-8 (AC-22) — so the human
  sees it before a run does. *(source: human, 2026-08-23; verify: client)*
- **AC-41** — WHERE the agent editor's `Context` tab shows a document inherited
  from a skill (AC-34), the system shall not let the human drag that row into
  another position: its position is decided by the skills' order on the agent
  (AC-39), and the inherited set changes whenever someone edits the skill, so a
  position stored for it on the agent would go stale. Only the agent's own
  attached documents are draggable (AC-13).
  *(source: human, 2026-08-23; verify: client)*
- **AC-42** — WHEN an earlier version of a skill is restored, the system shall
  not change which documents that skill contributes: a version snapshot covers
  the skill's own text, and attachments are not part of it.
  *(source: human, 2026-08-23; verify: server-integration)*

### What a run does with them

- **AC-19** — WHEN a review run starts for an agent, the system shall read,
  from the repository, the documents attached to that agent and to that agent's
  enabled skills, and shall include their text in the run's `## Project
  context` block, each document identified by its repository-relative path.
  *(source: human, 2026-08-23; mockup M8; verify: server-integration)*
- **AC-20** — WHERE the same document is attached both to the agent and to one
  of its enabled skills, the system shall include it once, at the position the
  agent's order gives it, and shall report it once among the documents read.
  *(source: human, 2026-08-23; verify: server-unit)*
- **AC-21** — The system shall mark the assembled `## Project context` block as
  untrusted reference material and shall instruct the model to treat its
  contents as data and never as instructions.
  *(source: human, 2026-08-23; mockup M8; verify: reviewer-core)*
- **AC-22** — IF an attached document cannot be read when a run assembles its
  prompt — because it is not there, because it is empty, or because it is not
  valid UTF-8 — THEN the system shall leave it out, record that it was skipped
  in the run trace, and complete the run.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-23** — IF the attached documents together exceed the project-context
  ceiling, THEN the system shall take them in the human's order, include each
  one whole or not at all, skip any document that does not fit in what remains
  and go on considering the documents after it, record every document it left
  out in the run trace, and complete the run.
  *(source: human, 2026-08-23 (delegated; interviewer-decided);
  verify: server-integration)*
- **AC-24** — WHILE the documents attached to an agent or to a skill exceed the
  project-context ceiling, the system shall warn on that editor's `Context` tab
  that some of them will not reach a run.
  *(source: human, 2026-08-23; verify: client)*
- **AC-25** — The run trace shall list the repository-relative path of every
  document the run read, and of every attached document the run did not
  include, stating for each omission whether the document could not be read
  (AC-22) or did not fit whole within the ceiling (AC-23), so that a reader can
  tell the two apart. *(source: mockup M7; human, 2026-08-23 (delegated;
  interviewer-decided); verify: client)*
- **AC-26** — The run trace's prompt assembly shall carry a slot labelled
  `Project context — attached specs (untrusted)` that expands to the assembled
  block verbatim, with the block's own copy and search controls.
  *(source: mockups M7, M8; verify: client)*
- **AC-27** — WHEN a review runs against a diff that violates an invariant
  stated in an attached document, the reviewer's finding shall reference that
  document. *(source: human, 2026-08-23; verify: manual)*
- **AC-28** — The project-context ceiling shall default to 32,000 approximate
  tokens of project context per run, and shall be configurable.
  *(source: human, 2026-08-23 (delegated; interviewer-decided);
  verify: server-unit)*
- **AC-32** — WHEN a run starts for an agent against a repository, the system
  shall use only the documents attached from that repository, and IF none are
  attached from it, THEN the run shall carry no project context and the trace
  shall state that none was attached, distinguishably from documents having
  been attached and none of them readable (AC-22).
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-33** — WHEN a run assembles its project context, the system shall record
  in the run trace which revision of the repository the documents were read at,
  alongside the list of documents read.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-39** — WHEN a run assembles its `## Project context` block, the system
  shall place the documents attached to the agent itself first, in the order the
  human gave them on the agent (AC-13), followed by the documents inherited from
  the agent's skills, ordered by the order the human gave those skills on that
  agent — the order shown on the agent's `Skills` tab — and, within one skill, by
  the order the human gave that skill's own documents.
  *(source: human, 2026-08-23; verify: server-integration)*
- **AC-40** — The system shall count a skill's documents as contributed — both
  into a run's `## Project context` block (AC-19, AC-39) and into the inherited
  set the agent's `Context` tab shows and totals (AC-34) — only while that skill
  is enabled and while that skill is enabled on that agent, so the tab and the
  run never disagree about which documents are inherited.
  *(source: human, 2026-08-23; verify: server-integration)*

## Edge cases

**Documents and the repository**

- An attached document no longer exists at run time — skipped and recorded
  (AC-22); the run still completes.
- An attached document was renamed. Indistinguishable from a deletion at the
  attached path, and handled the same way.
- A document listed on screen is deleted between the human reading the list and
  a run reading the file. Same handling as a missing document.
- The repository has no local copy yet, or one is still being made: the
  document list is empty rather than an error.
- No markdown document exists under the configured roots: the empty state,
  rather than an error.
- Two documents share a file name under different roots (`specs/api.md`,
  `docs/api.md`) — the reason every row shows the folder as well (AC-3).
- An attached document is empty, or is not valid UTF-8 — treated exactly like a
  missing one: skipped, recorded in the trace, the run completes (AC-22).
- The repository is deleted while documents from it are still attached to an
  agent — the attachments go with it (AC-31), and re-adding the repository does
  not bring them back; the human attaches again.
- An agent is used on a second repository with nothing attached from it — the
  run carries no project context, and the trace says so (AC-32).
- A very long document, and a document containing a very long single line, in
  preview.

**Editing**

- A saved edit is destroyed by the next resync of the repository. This is an
  accepted consequence of the chosen scope; the requirement is that the human
  is told (AC-7), not that it is prevented.
- Saving fails because the file was removed under the editor or the location is
  not writable — the failure is reported and the typed text stays in the editor,
  unsaved (AC-30). Nothing is lost, and the human can retry or copy the text out.
- A document is edited while a run that reads it is in flight: the run uses the
  text it read when it assembled its prompt.
- The revision recorded with a run (AC-33) identifies the committed documents,
  not necessarily the exact bytes that were read: a saved Studio edit lives only
  in the working copy on this machine and belongs to no revision (AC-6, AC-7),
  so a run that read an edited document cannot be reproduced from the revision
  alone.

**Attachment set and volume**

- The attached documents exceed the ceiling: documents are taken in the human's
  order and each is included whole or not at all (AC-23). A document is never
  truncated, because half an invariant is worse than none — the reviewer would
  cite a rule it had only seen part of, and neither the reviewer nor the human
  reading the finding could tell that it had.
- One document is too large to fit in what the ceiling leaves: it is skipped and
  the documents after it are still considered (AC-23), so a single large
  document early in the order does not silently cost every smaller document
  behind it. What keeps that non-arbitrary is the record: every omission is in
  the trace with its reason (AC-25), and the editor warns before the run
  (AC-24).
- The same document reaches a run through both the agent and one of its skills:
  included once, in the agent's position (AC-20) — and shown once, counted once,
  on the agent's `Context` tab (AC-34), so the tab's total and the run agree.
- An attached document that can no longer be read is marked on the editor's
  `Context` tab (AC-36) rather than only in the trace of the next run (AC-22);
  the two use the same three cases, so a document marked in the editor is the
  one a run would skip.
- Documents are reordered or detached while a run is in flight: the run uses
  the set and the order it resolved when it assembled its prompt.
- The ceiling is reached with documents inherited from a skill in the set. The
  agent's own documents come first (AC-39), so they are the ones that survive the
  ceiling and the inherited ones are the ones skipped when space runs out — which
  is the reason the order was chosen: attaching a document to *this* agent is a
  more deliberate act than inheriting one through a skill shared with other
  agents, so the general is cut before the specific. AC-23's "the human's order"
  is exactly the order AC-39 defines.
- An agent has an enabled skill whose documents alone exceed the ceiling. Its
  inherited documents are skipped from where the ceiling is reached (AC-23), and
  the agent's own attachments are unaffected, because they were taken first
  (AC-39) — editing a skill can change which *inherited* documents reach a run,
  never which of the agent's own do.
- A skill is disabled, or its link to this agent is disabled, while its
  documents are attached: they stop reaching runs and stop being shown as
  inherited (AC-40), and the attachments themselves are untouched — enabling it
  again brings them back.
- A skill is rolled back to an earlier version: its text changes and the
  documents it contributes do not (AC-42), so a run after the rollback carries
  the same project context as one before it.

**Degradation at each boundary**

- The repository cannot be read at all when a run starts: the review runs
  without project context and the trace records why. A run never fails because
  project context was unavailable.
- The document list cannot be produced: the agent's and skill's existing
  attachments are unaffected — they are stored as paths and survive a listing
  failure.

## Cross-module interactions

The Studio (`client`) talks only to the API (`server`); the API is the only
side that touches the repository's files; the review engine
(`reviewer-core`) receives the documents' text and never reads a file itself.

- **Studio → API** — list the repository's markdown documents; read one
  document's text; save one document's text; attach, detach and reorder the
  documents of an agent; the same for a skill; report which agents use a
  document, and how many (AC-8, AC-35).
- **API → the repository on disk** — enumerate markdown under the configured
  roots, read one document, write one document. Reading a single file already
  exists (`server/src/adapters/git/simple-git.ts:129-131`). A recursive walk of
  a clone also already exists (`server/src/modules/repo-intel/pipeline/walk.ts:53-121`)
  but is hardcoded to source extensions
  (`server/src/modules/repo-intel/constants.ts:14` — `.ts/.tsx/.js/.jsx/.mjs/.cjs`),
  so markdown is filtered out before any caller sees it. Writing a file into a
  clone does not exist at any level: the git port has `readFile` and no write
  method (`server/src/vendor/shared/adapters.ts:205-228`).
- **API → review engine** — the seam this feature fills is already built. The
  engine accepts project-context documents in a dedicated prompt slot
  (`reviewer-core/src/prompt.ts:81`), the run-trace contract already carries
  both the assembled block and the list of documents read
  (`contracts/trace.ts:43,89`), the trace builder already accepts a `specsRead`
  argument and has no callers yet (`server/src/platform/trace-builder.ts:33,52`),
  and the trace UI already renders both; each was put there ahead of the lesson
  that supplies its values, the same convention that keeps the schema's
  not-yet-used tables in place. This feature supplies those values: resolve the
  agent's documents plus those of its enabled skills, de-duplicate, read, apply
  the ceiling, pass their text into the slot, and report in the trace which
  documents went in and which did not.
- **API → Studio (run trace)** — the documents read and the assembled block
  already travel to the Studio in the run trace contract
  (`server/src/vendor/shared/contracts/trace.ts:43,89`), so this feature
  populates a path that exists; what it adds to that path is the block's label
  and the omitted documents with their reason (AC-25).
- **The Studio's existing per-skill agent count is untouched.** How many agents
  use a *skill* already ships on the skill card
  (`client/src/app/skills/_components/SkillCard/SkillCard.tsx:79-81`); the
  count this feature adds is the per-*document* one on the Project Context page
  and in the preview drawer (AC-8, AC-16).
- **Shared contracts** — any contract added for this feature lands in both
  vendored copies (`server/src/vendor/shared` and `client/src/vendor/shared`),
  which must stay byte-identical.

**What the Studio already has.** Most of the behaviour the `Context` tabs and
the Project Context page describe already exists in this codebase as working,
reusable UI. Listed so the cost of this feature is not read off its criteria
count:

| Behaviour a criterion needs | Where it already lives |
|---|---|
| A tab bar in the agent editor (`Config · Skills · Stats`) | `client/src/app/agents/[id]/_components/AgentEditor/constants.ts:11-17` |
| A tab bar in the skill editor (`Config · Preview · Stats · Versions`) | `client/src/app/skills/[id]/_components/SkillEditor/constants.ts:10-18` |
| An ordered many-to-many with per-link order and an enabled flag | `server/src/db/schema/agents.ts:51-65` (`agent_skills`) |
| Attach / detach / drag-reorder over exactly that shape, with persistence | `client/src/app/agents/[id]/_components/AgentEditor/_components/SkillsTab/SkillsTab.tsx:23-146`, drag at `:102-117` |
| A client-side text filter over that list (AC-15) | `SkillsTab.tsx:79-88` |
| A right-side preview drawer (AC-16) | `client/src/vendor/ui/kit/Drawer.tsx:4-40` |
| Markdown rendering (AC-5) | `client/src/vendor/ui/primitives/Markdown.tsx:6-42` |
| A markdown editor with a save action (AC-6) | `client/src/components/markdown-editor/MarkdownEditor.tsx:19-144`, wired at `SkillEditor/_components/ConfigTab/ConfigTab.tsx:57,94-95` |
| An approximate token count surfaced in the UI (AC-18) | `SkillEditor/constants.ts:21-23` (`estimateTokens`); engine twin at `reviewer-core/src/prompt-log.ts:4-6` (`approxTokens`) — both chars/4 |
| Counting how many agents use a thing (AC-8) | `server/src/modules/skills/helpers.ts:46` and `SkillCard.tsx:79-81`, for *skills*; there is no document equivalent, because no document entity exists yet |

Two consequences. Adding a `Context` tab (AC-9, AC-10) is one entry in an
existing array plus one tab component, not the building of tab navigation. And
M1's `Preview | Edit` toggle is the one piece of chrome with no counterpart in
the code — the nearest existing pattern is the tab bar above, and
`client/messages/en/context.json:15-18` carries `mode.preview` / `mode.edit`
labels that nothing consumes. AC-5, AC-6 and AC-7 stand as written.

The same unconsumed message file carries an empty-state body telling the human
to drop documents "under `.devdigest/specs/`"
(`client/messages/en/context.json:11-14`), which contradicts the search roots of
AC-2. The same file defines the footer's chunk copy, `"chunks": "{count}
chunks"` (`client/messages/en/context.json:3`), which AC-38 replaces with a
token total — the human confirmed `tokens total` as the wording on 2026-08-23.
Both are existing copy that will need rewording; each is a consequence of the
criterion above it, not a separate requirement.

**What is genuinely absent.** Three things, and they are this feature's real
cost:

1. **Writing a file into a clone** — the capability AC-6 needs. No write method
   exists on the git port, and the only file write found anywhere in the
   repository is the unrelated secrets file.
2. **Enumerating markdown in a clone** — the walk exists but filters markdown
   out before any caller sees it (see the disk boundary above), so AC-1 and
   AC-2 need it to admit a different set of extensions under different roots.
3. **A server module to own any of this** — no `context` module is registered
   in `server/src/modules/index.ts`, whose comment at line 25 lists
   "brief/context/onboarding" among the future course lessons.

```mermaid
sequenceDiagram
  participant W as Studio
  participant A as API
  participant R as repository on disk
  participant E as review engine
  W->>A: list documents (repository)
  A->>R: enumerate markdown under the roots
  R--)A: paths | unreadable
  A--)W: descriptors | empty list
  W->>A: attach / reorder documents for an agent
  A--)W: stored as paths
  W->>A: start a review run
  A->>A: resolve agent + enabled skills, order, de-duplicate, cap
  A->>R: read each attached document
  R--)A: text | missing (skipped, recorded)
  A->>E: review with the project-context texts
  E--)A: findings | error
  A--)W: run trace: documents read, the revision read at, the assembled block
  Note over A,R: a document that cannot be read is skipped; the run still completes
  Note over A,E: if nothing can be read, the review runs without project context
```

## Contracts

**The existing document-descriptor contract is this feature's base, and is
extended rather than duplicated** (human, 2026-08-23). The vendored shared
contracts carry a `SpecFile` shape (`path`, `content`, `size`, `updated_at`)
under a literal `// ---- Project Context ----` heading at
`server/src/vendor/shared/contracts/platform.ts:259-274`, and the client's
`useContextFiles(repoId)` hook is already written against it
(`client/src/lib/hooks/core.ts:123-130`, fetching `/repos/:id/context`, under a
comment reading "safe to call once API exposes it") — no server route backs it
yet, because there is no `context` module. The descriptor that crosses this
boundary is therefore that existing shape plus the three fields the mockups
require and it lacks: the document's **root**, its **approximate token count**,
and **how many agents use it**. No parallel document type is introduced beside
it.

**The existing `IndexStatus` contract belongs to a non-goal.** It describes
embedding indexing (`idle | cloning | parsing | embedding | done | error`,
`chunks_indexed`), which this spec rules out under Non-goals, and
`useReindexContext()` is written against it. This feature does not use either,
and neither is to be implemented as part of it. In particular, the refresh of
AC-4 is a **re-read of the document list from disk, not a re-index**: the two
are different operations, and the existing unused hook named
`useReindexContext` points at the one this feature does not do.

**Document descriptor** — what the Studio needs to draw a row and a preview
header. The first field and the existing optional ones (`content`, `size`,
`updated_at`) are the shape already defined; the last three are the addition:

```
path            string   required   repository-relative, e.g. specs/public-api.md
root            string   required   which configured root it was found under
approx_tokens   integer  required   approximate, see Non-functional requirements
used_by_agents  integer  required   how many agents use this document
used_by         list     required   the agents that use it — enough of each to
                                    name it and to open it (AC-35); empty when
                                    the count is zero
```

The Project Context page's two footer totals (AC-38) are the number of
descriptors in this list and the sum of their `approx_tokens`; nothing beyond
the list itself has to cross this boundary for them.

**Document body** — the document's text, plus its path. Error cases: the
document does not exist; it is not readable; the path is not inside the
configured roots (rejected, see Untrusted inputs).

**Attachments of an agent, and of a skill** — an ordered list of document
paths. The order is the human's (AC-13); position in the list is the position
in the assembled block. Each entry also says whether the document can currently
be read, so the editor can mark one that cannot (AC-36). For an agent, this
boundary additionally carries the documents its enabled skills contribute and
which skill each comes from, so the agent's `Context` tab can show them
distinguished from its own and count them once (AC-34, AC-20); *enabled* here
means both switches, the skill's own and its link to this agent (AC-40), and the
inherited entries arrive in the position AC-39 gives them, which is also the
position they take in the assembled block. Error cases: a path that is not a
document of this repository; a path repeated in the same list; a request to
reposition an inherited entry (AC-41).

**Save** — a document path and the new text. Error cases: the document does not
exist; the location is not writable; the path is not inside the configured
roots.

**The run trace** already carries both the list of documents read and the
assembled project-context block (`contracts/trace.ts:43,89`), so most of what
this feature needs is population and the block's label. Two things it must
express beyond that. Which revision of the repository the documents were read
at (AC-33), beside the list of documents read. And, for every attached document
that did not reach the prompt, which of the two reasons applied — the document could not be read (AC-22), or
it did not fit whole within the ceiling (AC-23). A reader of the trace must be
able to tell the two apart.

## Non-functional requirements

**Model use.** Attaching, listing, previewing, reordering and saving a document
never call a model. Reading the attached documents adds no model call to a run:
the documents are read from disk and placed in the prompt the run was going to
send anyway.

**Cost.** The only cost of this feature is prompt tokens on runs whose agent
has documents attached, attributed to those runs like any other prompt content.
The ceiling (AC-23, AC-24, AC-28) exists to bound that cost and to keep a large
attachment set from crowding the diff out of the prompt. Its default — 32,000
approximate tokens, roughly 128 KB of markdown — is a runaway guard rather than
a routine constraint: a hand-picked set of invariants documents is expected to
sit far below it, and a set that reaches it is a signal that the human attached
more than a reviewer can use.

**Failure.** No failure in this feature fails a review: an unreadable document
is skipped, an unreadable repository yields a review with no project context,
and both are recorded in the trace. The main review path stays deterministic
without any of this — a run with nothing attached behaves exactly as it does
today.

**Token counts are approximate.** Every count shown is an estimate, and reads as
one — M5 writes `≈ 317 tokens`. That holds for all three: the per-document count
in the preview drawer (AC-16); the total on the agent's `Context` tab (AC-18),
which after AC-34 spans the agent's own documents and those inherited from its
enabled skills; and the repository-wide total in the Project Context page's
footer (AC-38). The first two state what one run will send; the third states
only what the repository has available, and the two must not be read as the
same number.

**The agent's `Context` tab reads more than the agent.** AC-34 makes that tab
depend on the attachments of every skill the agent has enabled, so what it shows
changes when a skill is edited elsewhere; the tab must reflect the enabled
skills as they stand when it is shown, not a copy taken when the agent was
saved. Nothing on that path calls a model.

**Reordering must not depend on a pointer.** AC-13's drag has to be operable
from the keyboard as well; a drag handle alone leaves the order unreachable for
anyone not using a mouse. The reusable drag-reorder implementation named under
Cross-module interactions is HTML5 drag-and-drop with an `aria-hidden` handle
(`SkillsTab.tsx:102-124`), so reusing it as it stands does not by itself
satisfy this requirement.

**The save path is new exposure.** Until this feature, nothing in the Studio
wrote into a reviewed repository — the git port has no write method at all
(`server/src/vendor/shared/adapters.ts:205-228`). See Untrusted inputs.

**No access control** (decided by the human, 2026-08-23). This feature adds no
restriction on who may do any of it: any member of the workspace can read a
document, attach or detach it on any agent or skill, and edit and save its text,
including through the new save path above. That is a chosen posture rather than
an omission — it matches the rest of the Studio, where the `owner | member` role
the schema carries (`server/src/db/schema/core.ts:28`) is enforced by no route
today. Introducing a permission check here alone would leave the product
inconsistent; doing it product-wide is a separate decision, and this spec does
not make it.

## Inputs and provenance

| Input | Comes from | Boundary it crosses |
|---|---|---|
| The document list | markdown files in the reviewed repository's copy on this machine | disk → API → Studio |
| A document's text | the same files, authored by whoever can merge to that repository — and, from now on, by anyone who can edit through the Studio | disk → API → Studio, and disk → API → model |
| The attachment set and its order | the human, in the Studio | Studio → API |
| An edited document's text | the human, in the Studio | Studio → API → disk |
| The documents read, and the assembled block | the API, at run time | API → Studio (run trace) |

Documents are read from the repository's copy on this machine at whatever
commit that copy currently sits on, which is not necessarily the pull request's
head commit. The run trace therefore records both which documents were read and
which revision of the repository they were read at (AC-33) — with the limit that
a saved Studio edit belongs to no revision, so the recorded revision identifies
the committed documents rather than, always, the exact bytes read (see Edge
cases).

## Untrusted inputs

- **Every attached document is untrusted third-party text.** It reaches the
  model inside the `## Project context` block, and it is data, never
  instructions (AC-21). The shared injection guard already tells the model that
  delimited content is data in any language and that a claim of "test fixture"
  or "ignore this" never descopes a review
  (`reviewer-core/src/prompt.ts:16-33`).
- **Editing a document in the Studio does not make it trusted.** A human
  typing text into the Studio is not evidence the text is safe, and what they
  type is a copy of repository content either way. There is no path by which a
  document becomes trusted content.
- **A stored attachment is a path, and a path is an input.** It must be checked
  against the configured roots both when it is read and when it is written: a
  stored path must never reach a file outside the repository's copy, and a
  symbolic link inside that copy pointing outside it is the same problem in
  another shape.
- **The save path is the new one.** Before this feature the repository copy was
  read-only to the Studio; a write reachable from the browser must not be able
  to choose its own destination.

## Open questions

None outstanding. Every clarification this spec raised has been answered. The
four most recent were answered on 2026-08-23: the order the documents are
assembled in (AC-39), which *enabled* an inherited document follows (AC-40, and
AC-41 for what that makes draggable), what restoring an earlier version of a
skill does to its attachments (AC-42), and who may edit a document — no access
control, recorded under Non-functional requirements.

## Design review

All four proposals raised here were **accepted by the human on 2026-08-23** and
are now acceptance criteria. None is awaiting a decision; they are kept only as
the record of why those criteria exist.

| Proposal, and the problem it answered | Became |
|---|---|
| **The agent's `Context` tab under-reported what a run injects.** M5 shows only the documents attached to the agent itself, yet the documents of its enabled skills land in the very same block (AC-19), so both the `2 of 7 attached` badge and the `≈ 317 tokens` total described less than the run would send, and the ceiling warning (AC-24) was the first place the difference became visible. | AC-34 |
| **`Used by N agents` was a dead end.** M1, M3 and M6 told the human the number but not which agents, so removing a document from everywhere that read it meant opening every agent and every skill in turn. | AC-35 |
| **An attachment that no longer resolves was invisible until a run.** A deleted or renamed document is skipped and recorded in that run's trace (AC-22), which nobody reads until something looks wrong. | AC-36 |
| **Saving an edit changed what every agent using that document injects, with no acknowledgement.** The editor already knows the count (AC-8), and said nothing at the point where it mattered. | AC-37 |
