import axios from 'axios';
import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';
import type { SchemaRoute, RouteSchemas } from '../src/index.js';

const userParamsSchema = z.object({
	id: z.coerce.number().int().positive(),
});

const userResponseSchema = z.object({
	id: z.number(),
	name: z.string(),
	email: z.email(),
});

type UserResponse = z.output<typeof userResponseSchema>;
type UserParams = z.output<typeof userParamsSchema>;

const client = axios.create({
	baseURL: 'https://jsonplaceholder.typicode.com',
});

const detach = createSchemaMiddleware(client, {
	routes: {
		'GET /users/:id': {
			urlParams: userParamsSchema,
			response: userResponseSchema,
		},
	},
	parse: (schema, data, context ) => {
  	if (context.phase === 'response') {
			const parsedId: number = context.params.id;
			console.log(`Validated response for user ${parsedId}`);
		}

		return schema.parse(data);
	},
});

try {
	const { data: user } = await client.get<UserResponse>('/users/1');
	console.log(user.name);
} finally {
	detach();
}
