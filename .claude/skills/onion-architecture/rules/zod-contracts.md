# Zod contracts — ring 0 DTOs and boundary parsing

Contracts in `server/src/vendor/shared/contracts/*` (mirrored byte-identical
in `client/src/vendor/shared/contracts/*`) are the domain DTOs. They are
ring 0: no I/O, imported by every other ring.

## Do

- Edit `server/src/vendor/shared` and `client/src/vendor/shared` together,
  every time — they must stay byte-identical (see root `AGENTS.md`
  do-not-touch). This is a manually-synced copy, not a symlink.
- Parse untrusted input **once, at the boundary** — a route handler
  validating `req.body`, or an adapter validating an external API response.
  That parse is the anti-corruption layer between the outside world and the
  domain.
- Use `fastify-type-provider-zod` so one contract schema drives both request
  validation and response serialization (`rules/fastify-routes.md`).

## Don't

- Re-parse a value with the same schema deeper in the call stack. Once a
  route has validated `req.body` against a contract, the resulting object is
  already a valid domain value for the rest of the request — a second
  `Schema.parse()` inside a service is a smell, not defense in depth.
- Add a new field with `.nullable()` when you mean `.nullish()`, or vice
  versa. `.nullable()` makes a field *required* at the TypeScript level
  (just unions in `null`); `.nullish()` also makes it optional. Getting this
  backwards on a shared contract breaks `tsc --noEmit` at every existing
  object-literal construction site of that shape across `server/`, `client/`,
  and both packages' tests — grep for every literal of that type before
  changing a field's nullability.

For Zod schema authoring itself (validation patterns, `safeParse`,
`z.infer`), see the project's general `zod` skill — this file covers only
*where in the ring map* parsing happens, not how to write the schema.
