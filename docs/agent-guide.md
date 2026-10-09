# Agent Guide

This project is a small JavaScript library for validating Axios requests and responses using route-based schemas. It is intentionally lightweight and dependency-free at runtime.

## Project purpose

`axios.schema` lets you define route matching rules such as `GET /users/:id` and attach schema validation for:

- URL params (`urlParams`)
- request bodies (`request`)
- successful response payloads (`response`)

The library does not implement a schema system itself. Instead, it expects a `parse` callback that validates and optionally transforms the incoming data.

## Main entry point

- Source: `src/index.js`
- Package entry: `package.json`

The core API is:

```js
createSchemaMiddleware(client, { routes, parse })
```

It installs Axios request and response interceptors and selects the matching schema based on the HTTP method and URL path.

## Route matching behavior

Route keys use the pattern:

```txt
METHOD /path?query=value
```

Examples:

```js
{
  'GET /users/:id': { urlParams: schema, response: schema },
  'POST /items': { request: schema, response: schema },
  'GET /users?id=:id&active=true': { urlParams: schema }
}
```

Matching rules:

- Method matching is case-insensitive.
- Missing Axios method is treated as `GET`.
- Path segments beginning with `:` match one non-empty segment.
- Query parameters written as `:param` are captured into `context.params`.
- Literal query values must match exactly.
- Extra query parameters not listed in the route are ignored.

## Parser context

The supplied `parse` function receives:

```js
parse(schema, data, context)
```

Where `context` contains:

- `phase`: `'urlParams' | 'request' | 'response'`
- `config`: the Axios request config
- `params`: captured path/query params as strings during `urlParams`; for later phases, the object returned by the `urlParams` parser
- `response`: the Axios response object during the response phase

For `request` and `response`, the parsed return value replaces the original data. For `urlParams`, the parser receives the captured path/query parameter object and must return an object; that parsed object becomes `context.params` in later request and response phases. The `urlParams` phase itself receives the original string-valued captures.

Path and query captures are strings. When using Zod and a route parameter should be numeric, use `z.coerce.number()` to turn a value like `'42'` into `42`; the parsed value is available in later parser phases. `z.number()` alone rejects the original string.

## Request flow

1. `createSchemaMiddleware` builds route metadata from the `routes` map.
2. Axios request interceptor resolves a route match for the outgoing config.
3. If `urlParams` exists, it validates/transforms the captured parameters before request data validation.
4. If `request` exists, it validates/transforms `config.data`, receiving the parsed URL params in `context.params`.
5. Axios response interceptor resolves a route match for the response config.
6. If `response` exists, it validates/transforms successful `response.data`, receiving the parsed URL params in `context.params`.

## Validation approach

The library is intentionally generic. The parser can be:

- a Zod schema
- a JSON Schema/Ajv validator
- a custom function that throws on invalid data
- an async validator or transformer

The important contract is that `parse` returns the validated/normalized value and throws or rejects on invalid input.

## Testing and validation

Tests live in:

- `test/index.test.js`

Run the main suite:

```sh
npm test
```

Run coverage enforcement:

```sh
npm run test:coverage
```

Run type validation:

```sh
npm run test:types
```

## Repository conventions

- Code is ESM (`"type": "module"`)
- The library is small and focused; prefer minimal, direct implementations
- Keep route matching behavior compatible with Axios request configs
- Preserve `context.params`: it contains the captured values in `urlParams` and the parsed object in later phases

## Helpful references

- README: `README.md`
- Source: `src/index.js`
- Tests: `test/index.test.js`

This project is a good fit for focused, route-oriented validation logic without pulling in a large schema framework or custom runtime layer.
