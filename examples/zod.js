import axios from 'axios';
import { z } from 'zod';
import { createSchemaMiddleware } from '../src/index.js';

const client = axios.create({ baseURL: 'https://jsonplaceholder.typicode.com' });

const userSchema = z.object({
	id: z.number().int().positive(),
	name: z.string(),
	username: z.string(),
	email: z.email(),
	address: z.object({
		street: z.string(),
		suite: z.string(),
		city: z.string(),
		zipcode: z.string(),
		geo: z.object({
			lat: z.string(),
			lng: z.string(),
		}).strict(),
	}).strict(),
	phone: z.string(),
	website: z.string(),
	company: z.object({
		name: z.string(),
		catchPhrase: z.string(),
		bs: z.string(),
	}).strict(),
}).strict();

const createdUserSchema = z.object({
	id: z.number().int().positive(),
	name: z.string(),
	email: z.email(),
}).strict();

const createUserSchema = z.object({
	name: z.string().min(1),
	email: z.email(),
});

const userRequestParams = z.object({
	// URL params are strings; coerce the captured id to a number.
	id: z.coerce.number(),
}).strict();

const detach = createSchemaMiddleware(client, {
	routes: {
		'GET /users/:id': {
			urlParams: userRequestParams,
			response: userSchema,
		},
		'GET /users?id=:id': {
			urlParams: userRequestParams,
			response: z.array(userSchema),
		},
		'POST /users': {
			request: createUserSchema,
			response: createdUserSchema,
		},
	},
	parse: (schema, data, { phase, params }) => {
		if (phase === 'response' && params.id) {
			console.log(`Validated response for user ${typeof params.id} ${params.id}`);
		}

		return schema.parse(data);
	},
});

try {
	const { data: user } = await client.get('/users/1');
	console.log('Fetched user:', user);

	const { data: queryUser } = await client.get('/users?id=2');
	console.log('Fetched user by query parameter:', queryUser);

	const { data: createdUser } = await client.post('/users', {
		name: 'Ada Lovelace',
		email: 'ada@example.com',
	});
	console.log('Created user:', createdUser);
} finally {
	detach();
}
