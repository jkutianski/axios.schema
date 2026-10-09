import { expect, test } from '@jest/globals';
import { createSchemaMiddleware } from '../src/index.js';

function createAxiosMock() {
	let nextId = 0;
	const handlers = { request: new Map(), response: new Map() };
	const ejected = [];

	const createInterceptor = (type) => ({
		use(handler) {
			const id = nextId++;
			handlers[type].set(id, handler);
			return id;
		},
		eject(id) {
			ejected.push({ type, id });
			handlers[type].delete(id);
		},
	});

	return {
		client: {
			interceptors: {
				request: createInterceptor('request'),
				response: createInterceptor('response'),
			},
		},
		handlers,
		ejected,
	};
}

test('selects request and response schemas by HTTP method and URL path', async () => {
	const mock = createAxiosMock();
	const parsedSchemas = [];
	const parsedParams = [];
	const schemas = {
		'POST /users': { request: 'create-user-request' },
		'GET /users/:id': { response: 'user-response' },
	};

	createSchemaMiddleware(mock.client, {
		routes: schemas,
		parse: (schema, data, context) => {
			parsedSchemas.push(schema);
			parsedParams.push(context.params);
			return { ...data, schema };
		},
	});

	const requestConfig = { method: 'post', url: '/users', data: { name: 'Ada' } };
	const requestResult = await [...mock.handlers.request.values()][0](requestConfig);
	const responseConfig = { url: '/users/42?include=team' };
	const response = { config: responseConfig, data: { id: 42 } };
	const responseResult = await [...mock.handlers.response.values()][0](response);

	expect(requestResult.data).toEqual({ name: 'Ada', schema: 'create-user-request' });
	expect(responseResult.data).toEqual({ id: 42, schema: 'user-response' });
	expect(parsedSchemas).toEqual(['create-user-request', 'user-response']);
	expect(parsedParams).toEqual([{}, { id: '42' }]);
});

test('matches query parameters and exposes captured values in parser context', async () => {
	const mock = createAxiosMock();
	const parsedParams = [];

	createSchemaMiddleware(mock.client, {
		routes: {
			'GET /users?id=:id&active=true': { response: 'user-response' },
		},
		parse: (schema, data, context) => {
			parsedParams.push(context.params);
			return data;
		},
	});

	const responseHandler = [...mock.handlers.response.values()][0];
	const response = {
		config: { method: 'GET', url: '/users?active=true&id=42&include=team' },
		data: { id: 42 },
	};

	expect(await responseHandler(response)).toBe(response);
	expect(parsedParams).toEqual([{ id: '42' }]);
});

test('does not match routes with missing or mismatched query parameters', async () => {
	const mock = createAxiosMock();
	let parseCalled = false;

	createSchemaMiddleware(mock.client, {
		routes: {
			'GET /users?active=true&id=:id': { response: 'user-response' },
		},
		parse: (schema, data) => {
			parseCalled = true;
			return data;
		},
	});

	const responseHandler = [...mock.handlers.response.values()][0];
	for (const url of ['/users?active=true', '/users?active=false&id=42']) {
		const response = { config: { method: 'GET', url }, data: {} };
		expect(await responseHandler(response)).toBe(response);
	}
	expect(parseCalled).toBe(false);
});

test('validates combined URL params before request data', async () => {
	const mock = createAxiosMock();
	const parsed = [];

	createSchemaMiddleware(mock.client, {
		routes: {
			'POST /users/:id?active=:active': {
				urlParams: 'user-url-params',
				request: 'user-request',
			},
		},
		parse: (schema, data, context) => {
			parsed.push({ schema, data, phase: context.phase, params: context.params });
			return data;
		},
	});

	const config = {
		method: 'POST',
		url: '/users/42?active=true',
		data: { name: 'Ada' },
	};
	await [...mock.handlers.request.values()][0](config);

	expect(parsed).toEqual([
		{
			schema: 'user-url-params',
			data: { id: '42', active: 'true' },
			phase: 'urlParams',
			params: { id: '42', active: 'true' },
		},
		{
			schema: 'user-request',
			data: { name: 'Ada' },
			phase: 'request',
			params: { id: '42', active: 'true' },
		},
	]);
});

test('rejects a request when URL params fail validation', async () => {
	const mock = createAxiosMock();
	const validationError = new Error('Invalid URL params');
	let requestSchemaCalled = false;

	createSchemaMiddleware(mock.client, {
		routes: {
			'GET /users/:id': {
				urlParams: 'user-url-params',
				request: 'user-request',
			},
		},
		parse: (schema) => {
			if (schema === 'user-url-params') {
				throw validationError;
			}
			requestSchemaCalled = true;
		},
	});

	await expect(
		[...mock.handlers.request.values()][0]({
			method: 'GET',
			url: '/users/not-a-number',
			data: {},
		}),
	).rejects.toBe(validationError);
	expect(requestSchemaCalled).toBe(false);
});

test('does not apply route schemas when method, path, or URL does not match', async () => {
	const mock = createAxiosMock();
	const configs = [
		{ method: 'POST', url: '/users/42', data: {} },
		{ method: 'GET', url: '/users/', data: {} },
		{ method: 'GET', url: '/teams/42', data: {} },
		{ method: 'GET', url: '/users', data: {} },
		{ method: 'GET', url: '/users/42/teams', data: {} },
		{ method: 'GET', url: '/users?active=true', data: {} },
		{ method: 'GET', data: {} },
		{ method: 'GET', url: '/users/42', baseURL: 'invalid base', data: {} },
	];
	let parseCalled = false;

	createSchemaMiddleware(mock.client, {
		routes: { 'GET /users/:id': { request: 'user-request' } },
		parse: (schema, data) => {
			parseCalled = true;
			return data;
		},
	});

	const requestHandler = [...mock.handlers.request.values()][0];
	for (const config of configs) {
		expect(await requestHandler(config)).toBe(config);
	}
	expect(parseCalled).toBe(false);
});

test('awaits async parsers and provides request and response context', async () => {
	const mock = createAxiosMock();
	const contexts = [];

	createSchemaMiddleware(mock.client, {
		routes: {
			'GET /users/:id': {
				request: 'user-request',
				response: 'user-response',
			},
		},
		parse: async (schema, data, context) => {
			contexts.push({ schema, context });
			return { ...data, validated: true };
		},
	});

	const requestConfig = { method: 'GET', url: '/users/42', data: { name: 'Ada' } };
	const requestResult = await [...mock.handlers.request.values()][0](requestConfig);
	const response = { config: requestConfig, data: { id: 42 } };
	const responseResult = await [...mock.handlers.response.values()][0](response);

	expect(requestResult.data).toEqual({ name: 'Ada', validated: true });
	expect(responseResult.data).toEqual({ id: 42, validated: true });
	expect(contexts[0].schema).toBe('user-request');
	expect(contexts[0].context.phase).toBe('request');
	expect(contexts[0].context.config).toBe(requestConfig);
	expect(contexts[0].context.params).toEqual({ id: '42' });
	expect(contexts[1].schema).toBe('user-response');
	expect(contexts[1].context.phase).toBe('response');
	expect(contexts[1].context.config).toBe(requestConfig);
	expect(contexts[1].context.response).toBe(response);
	expect(contexts[1].context.params).toEqual({ id: '42' });
});

test('propagates parser errors from request and response interceptors', async () => {
	const mock = createAxiosMock();
	const parserError = new Error('Invalid data');

	createSchemaMiddleware(mock.client, {
		routes: {
			'POST /users': {
				request: 'user-request',
				response: 'user-response',
			},
		},
		parse: async () => {
			throw parserError;
		},
	});

	const requestHandler = [...mock.handlers.request.values()][0];
	const responseHandler = [...mock.handlers.response.values()][0];

	await expect(
		requestHandler({ method: 'POST', url: '/users', data: {} }),
	).rejects.toBe(parserError);
	await expect(
		responseHandler({ config: { method: 'POST', url: '/users' }, data: {} }),
	).rejects.toBe(parserError);
});

test('rejects invalid middleware options', () => {
	const mock = createAxiosMock();
	const validOptions = {
		routes: {},
		parse: (schema, data) => data,
	};
	const invalidRouteOptions = [
		{ routes: { users: {} }, message: 'invalid route key: users' },
		{ routes: { 'GET users?id=:id': {} }, message: 'invalid route key: GET users?id=:id' },
		{ routes: { 'GET /users#top': {} }, message: 'invalid route key: GET /users#top' },
		{ routes: { 'GET /users?': {} }, message: 'invalid route key: GET /users?' },
	];

	expect(() => createSchemaMiddleware({}, validOptions))
		.toThrow(new TypeError('client must be an Axios instance'));
	expect(() => createSchemaMiddleware(mock.client))
		.toThrow(new TypeError('routes must be an object or an array of objects keyed by "METHOD /path"'));
	expect(() => createSchemaMiddleware(mock.client, { ...validOptions, routes: null }))
		.toThrow(new TypeError('routes must be an object or an array of objects keyed by "METHOD /path"'));
	expect(() => createSchemaMiddleware(mock.client, { ...validOptions, routes: [] }))
		.toThrow(new TypeError('routes must be an object or an array of objects keyed by "METHOD /path"'));
	expect(() => createSchemaMiddleware(mock.client, { ...validOptions, parse: undefined }))
		.toThrow(new TypeError('parse must be a function'));
	expect(() => createSchemaMiddleware(mock.client, { routes: null, parse: validOptions.parse }))
		.toThrow(new TypeError('routes must be an object or an array of objects keyed by "METHOD /path"'));
	expect(() => createSchemaMiddleware(mock.client, { routes: [], parse: validOptions.parse }))
		.toThrow(new TypeError('routes must be an object or an array of objects keyed by "METHOD /path"'));

	for (const { routes, message } of invalidRouteOptions) {
		expect(() => createSchemaMiddleware(mock.client, { routes, parse: validOptions.parse }))
			.toThrow(new TypeError(message));
	}
});

test('ejects both interceptors when detached', () => {
	const mock = createAxiosMock();
	const detach = createSchemaMiddleware(mock.client, {
		routes: {},
		parse: (schema, data) => data,
	});

	detach();

	expect(mock.ejected).toEqual([
		{ type: 'request', id: 0 },
		{ type: 'response', id: 1 },
	]);
	expect(mock.handlers.request.size).toBe(0);
	expect(mock.handlers.response.size).toBe(0);
});
