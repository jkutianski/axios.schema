# ![axios.schema](logo.svg) ![License](https://badgen.net/github/license/jkutianski/axios.schema) ![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/jkutianski/axios.schema/ci.yml) ![NPM Version](https://badgen.net/npm/v/axios.schema)

**Route-based runtime validation for Axios.** Define schemas by HTTP method and URL path, then validate URL parameters, request bodies, and successful response data with <strong>Zod</strong>, <strong>JSON Schema/Ajv</strong>, or your own synchronous or asynchronous parser.

Use this when an Axios client needs API contract validation at its request/response boundary. `axios.schema` connects Axios routes to a validator; it is not a schema language or validation library, and it adds no runtime dependency on Zod, Ajv, or TypeScript.

## Usage

Install the project dependencies:

```sh
npm install axios.schema axios
```

```js
import axios from 'axios';
import { createSchemaMiddleware } from 'axios.schema';

const client = axios.create({ baseURL: 'https://api.example.com' });

const detach = createSchemaMiddleware(client, {
  routes: {
    'POST /items': {
      request: (data) => {
        if (!data || typeof data.name !== 'string') {
          throw new TypeError('Expected request data with a name');
        }
        return data;
      },
      response: (data) => {
        if (!data || typeof data.id !== 'number') {
          throw new TypeError('Expected response data with a numeric id');
        }
        return data;
      },
    },
  },
  parse: (schema, data) => schema(data),
});

const response = await client.post('/items', { name: 'Example' });
console.log(response.data);

// Remove both Axios interceptors when they are no longer needed.
detach();
```

The middleware passes the selected schema and data to `parse(schema, data, context)`. The `context.phase` value is `'urlParams'`, `'request'`, or `'response'`. The parser may be asynchronous and should return the parsed data; thrown errors or rejected promises reject the Axios request.

For `request` and `response` phases, the parser's returned value replaces the request body or response data, so schema transformations are applied. For `urlParams`, the parser receives the captured path/query parameter object and its returned object becomes `context.params` for the request and response phases. This lets schema transformations such as `z.coerce.number()` expose normalized values. The `urlParams` parser must return an object; its own `urlParams` context still contains the original string-valued captures.

For a TypeScript example, see [`examples/typescript_zod.ts`](examples/typescript_zod.ts). Run the declaration and usage type checks with `npm run test:types`.

## Select By HTTP Method And Path

Schemas are selected from a `routes` map using the request method and URL path. A path segment beginning with `:` matches one non-empty segment, and its value is available in `context.params`:

```js
const detach = createSchemaMiddleware(client, {
  routes: {
    'POST /users': {
      request: createUserRequestSchema,
      response: userResponseSchema,
    },
    'GET /users/:id': {
      urlParams: userRequestParams,
      response: userResponseSchema,
    },
    'GET /other?id=:id': {
      urlParams: userRequestParams,
      response: userResponseSchema,
    },
  },
  parse: (schema, data, context) => schema.parse(data),
});

await client.post('/users', { name: 'Ada' });
await client.get('/users/42');
await client.get('/other?id=123');
```

For `GET /users/42`, the path parameter is initially captured as the string `'42'`; for `GET /other?id=123`, the query parameter is initially captured as `'123'`. If a route has a `urlParams` schema, its parsed object is used as `context.params` in the later request/response phases. Query parameter order does not matter, and parameters not listed in the route key are ignored.

URL path and query parameters arrive as strings. With Zod, use `z.coerce.number()` when a parameter should be converted to a number: parsing `{ id: '42' }` produces `{ id: 42 }`, which is then available as `context.params` in the `request` and `response` phases. Without coercion, `z.number()` rejects the captured string.

For a matching request, schemas run in this order: `urlParams`, then `request`, then `response` after Axios receives a successful response. The middleware passes the captured path and query parameters to `parse` as one object during the `urlParams` phase before parsing request-body data. The object returned by `urlParams` parsing is used as `context.params` in the later phases; the `urlParams` phase itself receives the original string-valued captures.

Route keys use the form `METHOD /path` with optional query parameters; method matching is case-insensitive. If Axios does not provide a method, the middleware treats it as `GET`. Static path segments must match exactly; `:param` path segments match one non-empty segment. Query parameters written as `:param` capture their value, while literal query values must match exactly. If no route matches, data is left unchanged.

## Using A Schema Library

The middleware does not depend on a particular schema library. Adapt its parser to your library's API. For example, with Zod:

```js
import { z } from 'zod';
import { createSchemaMiddleware } from 'axios.schema';

const itemRequest = z.object({ name: z.string() });
const itemResponse = z.object({ id: z.number(), name: z.string() });

const detach = createSchemaMiddleware(client, {
  routes: {
    'POST /items': {
      request: itemRequest,
      response: itemResponse,
    },
  },
  parse: (schema, data) => schema.parse(data),
});
```

Validation and transformation behavior is controlled by the supplied parser. For instance, use `safeParse` and handle its result there if you prefer not to throw on invalid data.

For a complete runnable example with request and response validation, see [`examples/zod.js`](examples/zod.js). In the repository checkout, install the development dependencies and run it with:

```sh
npm install
node examples/zod.js
```

JSON Schema works with validators such as Ajv. The parser validates the data and returns it unchanged:

```js
import Ajv from 'ajv';
import { createSchemaMiddleware } from 'axios.schema';

const ajv = new Ajv();

const detach = createSchemaMiddleware(client, {
  routes: {
    'POST /items': {
      request: {
        type: 'object',
        properties: { name: { type: 'string', minLength: 1 } },
        required: ['name'],
        additionalProperties: false,
      },
    },
  },
  parse: (schema, data) => {
    const validate = ajv.compile(schema);
    if (!validate(data)) {
      throw new TypeError(ajv.errorsText(validate.errors));
    }
    return data;
  },
});
```

For a complete runnable example with request and response validation, see [`examples/json-schema.js`](examples/json-schema.js). In the repository checkout, run it with:

```sh
npm install
node examples/json-schema.js
```

## Why use axios.schema?

* **One route map** selects request and successful-response schemas by HTTP method and path.
* <strong>Bring your own validator</strong>: Zod, Ajv/JSON Schema, or a custom parser; the middleware has no schema-format lock-in.
* **Dynamic paths** expose parameters such as `:id` to the parser context.
* <strong>Async-ready</strong>: parser promises are awaited, and validation errors reject the Axios request.
* <strong>Easy cleanup</strong>: `detach()` removes both Axios interceptors.

The package itself has no runtime dependency on a schema library. Axios is a peer dependency; Zod, Ajv, and Axios are development dependencies used by the examples.

## TypeScript

The package includes TypeScript declarations. The parser's schema argument is inferred from the schemas in the route map, and its context is a discriminated union of `'urlParams'`, `'request'`, and `'response'` phases. The declarations do not depend on Zod, Ajv, or TypeScript at runtime.

## Development

Run the middleware tests from a checkout:

```sh
npm test
npm run test:types
```

The runnable examples call JSONPlaceholder, so they require network access:

```sh
node examples/zod.js
node examples/json-schema.js
```

## API

```js
createSchemaMiddleware(client, { routes, parse })
```

* `client`: an Axios instance.
* `routes`: an object keyed by `METHOD /path`. Methods are case-insensitive; a missing Axios method defaults to `GET`. Path segments prefixed with `:` match one non-empty segment.
* Each route may define `urlParams`, `request`, and/or `response` schemas.
* `urlParams`: optional schema parsed against captured path and query parameters before request data; its parsed object becomes `context.params` in request and response phases.
* `parse(schema, data, context)`: parser called for matching URL parameters, request data, or successful response data. It may return a promise.
* `context.phase` identifies `'urlParams'`, `'request'`, or `'response'`; `context.params` contains matched path and query parameters. Response parsing receives `context.response`.
* Returns a `detach()` function that ejects the installed request and response interceptors.