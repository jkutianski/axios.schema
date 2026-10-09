# Axios Schema Skill

## Purpose

Use this skill when working on the `axios.schema` repository. It gives a compact, repo-specific guide for changing route-based Axios validation logic without drifting from the project’s conventions.

## Project summary

`axios.schema` is a lightweight Axios middleware that matches HTTP routes and validates URL parameters, request bodies, and successful response payloads using a supplied parser.

Core concepts:

- Route keys look like `METHOD /path` with optional `?query=value`
- Path params such as `:id` are captured into `context.params`
- Query params written as `:param` are also captured into `context.params`
- The parser contract is `parse(schema, data, context)`
- `context.phase` is one of `'urlParams'`, `'request'`, or `'response'`
- For `request` and `response`, the parsed value replaces the original data
- For `urlParams`, the validation runs but the return value is ignored

## Files to inspect first

- `src/index.js` — middleware logic and route matching
- `test/index.test.js` — current behavior and regression tests
- `README.md` — intended API and examples

## Working rules

1. Keep the middleware generic and parser-agnostic.
2. Preserve the existing request/response interceptor behavior.
3. Preserve route matching semantics for method, path, and query params.
4. When changing behavior, add or update tests in `test/index.test.js`.
5. Keep the parser context deterministic: `context.params` should remain string-valued captures.
6. Prefer surgical changes; do not broaden scope beyond the specific bug or feature.
7. Guarantee coverage remains at 100% when modifying logic.

## Common tasks

### Fixing request/response validation

Look at `createSchemaMiddleware` and the matching helpers in `src/index.js`. Confirm the selected route matches the method, path, and query params before calling `parse`.

### Adding support for Axios params

If Axios config includes `params`, normalize them into the effective URL search params before route matching, and make sure the captured values appear correctly in `context.params`.

### Updating tests

Add focused tests for:

- method/path matching
- query param matching
- dynamic path params
- missing or mismatched query values
- request/response validation sequencing
- parser error propagation
- invalid route keys / invalid middleware options

## Validation commands

Use the project’s standard commands:

```sh
npm test
npm run test:coverage
npm run test:types
```

## Notes for agents

- This project is intentionally small and opinionated.
- Do not introduce a schema library dependency into the runtime.
- Keep examples and docs aligned with actual behavior.
- Prefer minimal, readable code over abstraction that does not add value.
