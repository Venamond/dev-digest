---
description: Interview, analyse the design, and write one SDD feature spec under specs/
argument-hint: "<feature description> | <path to an existing spec> <what changed>"
---

Invoke the `spec-creator` skill now.

- If the argument is a **feature description**: run the full interview — take
  in the design sources, ground them in the code, analyse the design through
  the four lenses, ask what would change the spec, confirm the target path and
  Spec ID, then dispatch the `spec-creator` agent to write the file.
- If the argument names an **existing spec** under `specs/`: run mode B — read
  that spec first, run only the phases the change needs, and dispatch the agent
  to fold the answers in, move the `Status` if the human said so, or maintain
  the supersede pair.
- If no design source is supplied, ask for one before anything else. A spec
  written from no source is a guess with headings.
