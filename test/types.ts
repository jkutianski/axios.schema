import axios from 'axios';
import { z } from 'zod';
import {
	createSchemaMiddleware,
	type ResponseParseContext,
	type SchemaRoute,
	type URLParamsParseContext,
} from '../src/index.js';

const userSchema = z.object({
	id: z.number(),
});

const route: SchemaRoute<z.ZodString, undefined, typeof userSchema> = {
	urlParams: z.string(),
	response: userSchema,
};

declare const paramsContext: URLParamsParseContext;
declare const responseContext: ResponseParseContext;

paramsContext.params.id;
responseContext.response.status;

createSchemaMiddleware(axios.create(), {
	routes: {
		'GET /users/:id': {
			urlParams: z.object({ id: z.string() }),
			response: userSchema,
		},
	},
	parse: (schema, data, context) => {
		if (context.phase === 'response') {
			context.response.status;
		}

		return schema.parse(data);
	},
});

void route;
