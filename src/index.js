/**
 * Normalizes Axios query params into a flat list of key/value pairs.
 *
 * @param {unknown} params - Axios query params value.
 * @returns {[string, string][]} Flattened params entries.
 */
function getSearchParamsEntries(params) {
	if (params === undefined || params === null) {
		return [];
	}

	if (params instanceof URLSearchParams) {
		return [...params.entries()];
	}

	if (typeof params === 'string') {
		return [...new URLSearchParams(params).entries()];
	}

	if (Array.isArray(params)) {
		return params.flatMap((entry) => {
			if (Array.isArray(entry)) {
				const [key, value] = entry;
				return key === undefined ? [] : [[String(key), String(value ?? '')]];
			}

			return [];
		});
	}

	return Object.entries(params).flatMap(([key, value]) => {
		if (value === undefined) {
			return [];
		}

		if (Array.isArray(value)) {
			return value.map((item) => [String(key), String(item ?? '')]);
		}

		if (value !== null && typeof value === 'object') {
			return [[String(key), JSON.stringify(value)]];
		}

		return [[String(key), String(value)]];
	});
}

/**
 * Resolves a request URL from an Axios config.
 *
 * @param {import('axios').AxiosRequestConfig | undefined} config - Axios config.
 * @returns {URL | null} The resolved URL, or `null` when the config has no usable URL.
 */
function getURL(config) {
	if (typeof config?.url !== 'string') {
		return null;
	}

	try {
		const url = new URL(config.url, config.baseURL ?? 'http://localhost');
		const searchParams = new URLSearchParams(url.search);
		for (const [key, value] of getSearchParamsEntries(config.params)) {
			searchParams.append(key, value);
		}
		url.search = searchParams.toString();
		return url;
	} catch {
		return null;
	}
}

/**
 * Matches a route pattern against an actual URL pathname.
 *
 * @param {string[]} patternSegments - Route segments, including `:param` placeholders.
 * @param {string[]} pathSegments - Actual URL path segments.
 * @returns {{ [key: string]: string } | null} Matched path parameter map, or `null`.
 */
function matchPath(patternSegments, pathSegments) {
	if (patternSegments.length !== pathSegments.length) {
		return null;
	}

	const params = {};
	for (const [index, segment] of patternSegments.entries()) {
    const isPathParameter = segment.startsWith(':');
    const pathSegment = pathSegments[index];
    const isMatch = isPathParameter
      ? pathSegment.length !== 0
      : segment === pathSegment;

    if (!isMatch) {
      return null;
    }

    if (isPathParameter) {
      params[segment.slice(1)] = pathSegment;
    }
	}

	return params;
}

/**
 * Matches a route pattern against the query string and captures dynamic params.
 *
 * @param {Iterable<[string, string]>} patternParams - Query params defined by the route key.
 * @param {URLSearchParams} searchParams - URL query string parameters from the request.
 * @param {{ [key: string]: string }} params - Parameter bag to populate.
 * @returns {boolean} `true` when the query string matches the route pattern.
 */
function matchQuery(patternParams, searchParams, params) {
	for (const [key, patternValue] of patternParams) {
		const value = searchParams.get(key);
		if (value === null) {
			return false;
		}

		if (patternValue.startsWith(':')) {
			params[patternValue.slice(1)] = value;
		} else if (patternValue !== value) {
			return false;
		}
	}

	return true;
}

/**
 * Create a route-based validation middleware for Axios.
 *
 * Each entry in `options.routes` is keyed by `METHOD /path`, such as `GET /users/:id`.
 * Matching routes validate the captured URL parameters, request body, or successful
 * response data using the parser supplied in `options.parse`.
 *
 * @example
 * import axios from 'axios';
 * import { z } from 'zod';
 * import { createSchemaMiddleware } from 'axios.schema';
 *
 * const client = axios.create({ baseURL: 'https://api.example.com' });
 * const detach = createSchemaMiddleware(client, {
 *   routes: {
 *     'GET /users/:id': {
 *       urlParams: z.object({ id: z.string().regex(/^\d+$/) }),
 *       response: z.object({ id: z.number(), name: z.string() }),
 *     },
 *   },
 *   parse: (schema, data) => schema.parse(data),
 * });
 * await client.get('/users/42');
 * detach();
 *
 * @param {import('axios').AxiosInstance} client - Axios instance to attach interceptors to.
 * @param {{
 *   routes: Record<string, {
 *     urlParams?: unknown,
 *     request?: unknown,
 *     response?: unknown,
 *   }>,
 *   parse: (schema: unknown, data: unknown, context: {
 *     phase: 'urlParams' | 'request' | 'response',
 *     config: import('axios').AxiosRequestConfig,
 *     params: Record<string, unknown>,
 *     response?: import('axios').AxiosResponse,
 *   }) => unknown | Promise<unknown>
 * }} options - Middleware configuration.
 * @returns {() => void} A function that ejects the installed interceptors.
 * @throws {TypeError} If the client, routes, parser, route key, or parsed URL params are invalid.
 */
export function createSchemaMiddleware(client, options) {
	const { routes, parse } = options ?? {};

	if (!client?.interceptors?.request || !client?.interceptors?.response) {
		throw new TypeError('client must be an Axios instance');
	}

	if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
		throw new TypeError('routes must be an object or an array of objects keyed by "METHOD /path"');
	}

	if (typeof parse !== 'function') {
		throw new TypeError('parse must be a function');
	}

	const routeEntries = Object.entries(routes).map(([key, schema]) => {
		const match = /^([A-Za-z]+) (\/\S*)$/.exec(key);
		if (!match || match[2].includes('#')) {
			throw new TypeError(`invalid route key: ${key}`);
		}

		const queryIndex = match[2].indexOf('?');
		const pathname = queryIndex === -1 ? match[2] : match[2].slice(0, queryIndex);
		const query = queryIndex === -1 ? '' : match[2].slice(queryIndex + 1);
		if (queryIndex !== -1 && query.length === 0) {
			throw new TypeError(`invalid route key: ${key}`);
		}

		return {
			method: match[1].toUpperCase(),
			segments: pathname.split('/'),
			queryParams: [...new URLSearchParams(query)],
			schema,
		};
	});

/**
 * Finds the matching route definition for a given Axios request or response config.
 *
 * @param {import('axios').AxiosRequestConfig} config - Axios request config.
 * @returns {{ schema: { urlParams?: unknown, request?: unknown, response?: unknown }, params: Record<string, string> } | undefined}
 *   Matching route metadata, or `undefined` when no route matches.
 */
	const getRoute = (config) => {
		const url = getURL(config);
		if (url === null) {
			return undefined;
		}

		const method = typeof config?.method === 'string' ? config.method.toUpperCase() : 'GET';
		for (const route of routeEntries) {
			if (route.method !== method) {
				continue;
			}

			const params = matchPath(route.segments, url.pathname.split('/'));
			if (
				params !== null
				&& matchQuery(route.queryParams, url.searchParams, params)
			) {
				return { schema: route.schema, params };
			}
		}

		return undefined;
	};

	const parsedURLParamsByConfig = new WeakMap();

	const requestId = client.interceptors.request.use(async (config) => {
		const match = getRoute(config);
		const urlParamsSchema = match?.schema.urlParams;
		const schema = match?.schema.request;
		let params = match?.params;

		if (urlParamsSchema !== undefined) {
			const parsedParams = await parse(urlParamsSchema, params, {
				phase: 'urlParams',
				config,
				params,
			});
			if (parsedParams === null || typeof parsedParams !== 'object' || Array.isArray(parsedParams)) {
				throw new TypeError('urlParams parser must return an object');
			}
			params = parsedParams;
		}

		if (schema !== undefined) {
			config.data = await parse(schema, config.data, {
				phase: 'request',
				config,
				params,
			});
		}

		if (match !== undefined) {
			parsedURLParamsByConfig.set(config, params);
		}

		return config;
	});

	const responseId = client.interceptors.response.use(async (response) => {
		const match = getRoute(response.config);
		const schema = match?.schema.response;

		if (schema !== undefined) {
			response.data = await parse(schema, response.data, {
				phase: 'response',
				config: response.config,
				response,
				params: parsedURLParamsByConfig.get(response.config) ?? match.params,
			});
		}

		return response;
	});

	return () => {
		client.interceptors.request.eject(requestId);
		client.interceptors.response.eject(responseId);
	};
}
