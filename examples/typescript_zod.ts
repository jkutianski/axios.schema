import axios from 'axios';
import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';

const userParamsSchema = z.object({
	id: z.string().regex(/^\d+$/),
});

const userResponseSchema = z.object({
	id: z.number(),
	name: z.string(),
	email: z.email(),
});

type UserResponse = z.output<typeof userResponseSchema>;

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
	parse: (schema, data, context) => {
		if (context.phase === 'urlParams') {
			// URL parameter parsing validates; its return value is not used.
			return schema.parse(data);
		}

		if (context.phase === 'response') {
			console.log(`Validating response for ${context.config.url}`);
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
