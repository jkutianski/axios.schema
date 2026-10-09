---
name: axios-schema
description: Use axios.schema to validate Axios URL params, request bodies, and responses with route-based matching and a custom parser, Zod, or Ajv.
---

# axios.schema

## What this library does

`axios.schema` is a route-based Axios middleware for validating request data and successful response payloads at the HTTP boundary.

It matches routes like:

- `GET /users/:id`
- `POST /items`
- `GET /users?id=:id&active=true`

and validates:

- captured `urlParams`
- `request` bodies
- successful `response` payloads

## Install

Install the core dependencies:

```bash
npm install axios axios.schema
```

The following Basic setup example uses Zod, so install it before running that example:

```bash
npm install zod
```

Zod is optional. You can use Ajv or a custom parser instead.

## Basic setup

```js
import axios from 'axios';
import { createSchemaMiddleware } from 'axios.schema';
import { z } from 'zod';

const client = axios.create({ baseURL: 'https://api.example.com' });

const detach = createSchemaMiddleware(client, {
  routes: {
    'GET /users/:id': {
      urlParams: z.object({ id: z.string() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
    'POST /users': {
      request: z.object({ name: z.string() }),
      response: z.object({ id: z.number(), name: z.string() }),
    },
  },
  parse: (schema, data, context) => schema.parse(data),
});

// use client...
detach();
```

## Core API

```js
createSchemaMiddleware(client, { routes, parse })
```

Parameters:

- `client`: Axios instance
- `routes`: map of `METHOD /path` to validation schemas
- `parse(schema, data, context)`: parser, validator, or transformer

## Parser contract

```js
parse(schema, data, context)
```

`context` contains:

- `phase`: `'urlParams' | 'request' | 'response'`
- `config`: Axios request config
- `params`: matched path/query values as strings
- `response`: response object during response phase

Behavior:

- `urlParams`: validates the captured path/query parameter object; the parser's return value is ignored, so these params are not transformed in the same way as request or response bodies
- `request`: validates/transforms `config.data`, and the returned value replaces the request body
- `response`: validates/transforms the successful `response.data`, and the returned value replaces the response payload
- thrown errors or rejected promises fail the request

## Route matching rules

Supported route patterns:

- `METHOD /users/:id`
- `METHOD /users?id=:id`
- `METHOD /users?id=active&role=user`

Rules:

- method matching is case-insensitive
- missing method defaults to `GET`
- `:param` matches a single non-empty path segment
- literal query values must match exactly
- route params become `context.params[paramName]`
- params not listed in the route are ignored

## Adapter examples

### Zod

```js
import { z } from 'zod';
const parse = (schema, data) => schema.parse(data);
```

### Ajv / JSON Schema

```js
import Ajv from 'ajv';
const ajv = new Ajv();

const parse = (schema, data) => {
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    throw new TypeError(ajv.errorsText(validate.errors));
  }
  return data;
};
```

### Custom validator

```js
const parse = (schema, data) => {
  if (!schema(data)) {
    throw new TypeError('Invalid payload');
  }
  return data;
};
```

## Typical debugging checklist

- route keys are valid `METHOD /path` strings
- path params use `:name` and match non-empty segments
- literal query values match exactly
- when the request config includes `params`, those values are merged into the effective URL before matching; existing URL query entries are preserved and appended
- parser is throwing or rejecting unexpectedly
- `context.params` values are stringified as expected

## Repo maintenance notes

When modifying the library itself, inspect:

- `src/index.js`: middleware and route matching logic
- `test/index.test.js`: regression coverage
- `README.md`: usage and external API docs
- `examples/zod.js` and `examples/json-schema.js`: example integrations

Validation commands:

```bash
npm test
npm run test:coverage
npm run test:types
```

## Compatibility note

YAML frontmatter improves discoverability and metadata, but automatic installation depends on the consuming agent/tooling. This skill is written to be useful both for external integration and for repo maintenance.
