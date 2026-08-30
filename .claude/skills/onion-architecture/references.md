# References

Copied from `docs/superpowers/specs/2026-08-03-onion-architecture-skill-design.md`.

## Canon

- [The Onion Architecture: part 1 — Jeffrey Palermo](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [Onion Architecture — Herberto Graça](https://medium.com/the-software-architecture-chronicles/onion-architecture-79529d127f85)
- [Onion Architecture — Allegro Tech Blog](https://blog.allegro.tech/2023/02/onion-architecture.html)
- [Onion Architecture: Going Beyond Layers — NDepend](https://blog.ndepend.com/onion-architecture-layers/)
- [Chop Onions Instead of Layers — Methods & Tools](https://www.methodsandtools.com/archive/onionsoftwarearchitecture.php)

## Node/TypeScript practice

- [DTOs, Mappers & the Repository Pattern — Khalil Stemmler](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/)
- [Clean Architecture in Node.js: the Repository Pattern — Alex Rusin](https://blog.alexrusin.com/clean-architecture-in-node-js-implementing-the-repository-pattern-with-typescript-and-prisma/)
- [fastify-typescript-drizzle-starter-kit](https://github.com/256Taras/fastify-typescript-drizzle-starter-kit) — closest published layering to our stack
- [onion-architecture-boilerplate — Melzar](https://github.com/Melzar/onion-architecture-boilerplate)

## Enforcement

- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Dependency Cruiser: Restrict Imports — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/)
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [How We Enforce Architecture Boundaries at Scale — lastminute.com](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/)
- [Maintaining clean architecture with dependency rules — cubic.dev](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)
- [Clean Architecture Anti-Patterns — Milan Jovanović](https://milanjovanovic.tech/blog/clean-architecture-anti-patterns) — returned HTTP 403 when fetched during research; listed as further reading, nothing in this skill is drawn from it

## Related project skills

- `clean-ddd-hexagonal` (personal skill) — general DDD/Hexagonal/Clean
  Architecture/CQRS/Event Sourcing theory, language-agnostic. This skill
  defers to it for anything not specific to DevDigest's `server`/`reviewer-core`.
- `fastify-best-practices`, `drizzle-orm-patterns`, `zod` (project skills) —
  tool-level conventions this skill builds on rather than repeats.
