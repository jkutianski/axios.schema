import axios from 'axios';
import Ajv from 'ajv';
import { createSchemaMiddleware } from '../src/index.js';

const client = axios.create({ baseURL: 'https://jsonplaceholder.typicode.com' });
const ajv = new Ajv(); // use { coerceTypes: true } in case you want to coerce types automatically

const userSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer', minimum: 1 },
		name: { type: 'string' },
		username: { type: 'string' },
		email: { type: 'string' },
		address: {
			type: 'object',
			properties: {
				street: { type: 'string' },
				suite: { type: 'string' },
				city: { type: 'string' },
				zipcode: { type: 'string' },
				geo: {
					type: 'object',
					properties: {
						lat: { type: 'string' },
						lng: { type: 'string' },
					},
					required: ['lat', 'lng'],
					additionalProperties: false,
				},
			},
			required: ['street', 'suite', 'city', 'zipcode', 'geo'],
			additionalProperties: false,
		},
		phone: { type: 'string' },
		website: { type: 'string' },
		company: {
			type: 'object',
			properties: {
				name: { type: 'string' },
				catchPhrase: { type: 'string' },
				bs: { type: 'string' },
			},
			required: ['name', 'catchPhrase', 'bs'],
			additionalProperties: false,
		},
	},
	required: [
		'id',
		'name',
		'username',
		'email',
		'address',
		'phone',
		'website',
		'company',
	],
	additionalProperties: false,
};

const createUserSchema = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1 },
		email: { type: 'string', minLength: 1 },
	},
	required: ['name', 'email'],
	additionalProperties: false,
};

const createdUserSchema = {
	type: 'object',
	properties: {
		id: { type: 'integer', minimum: 1 },
		name: { type: 'string' },
		email: { type: 'string' },
	},
	required: ['id', 'name', 'email'],
	additionalProperties: false,
};

const userRequestParams = {
	type: 'object',
	properties: {
		id: { type: 'string', pattern: '^\\d+$' },
	},
	required: ['id'],
	additionalProperties: false,
};

const detach = createSchemaMiddleware(client, {
	routes: {
		'GET /users/:id': {
			urlParams: userRequestParams,
			response: userSchema,
		},
		'GET /users?id=:id': {
			urlParams: userRequestParams,
			response: {
				type: 'array',
				items: userSchema,
			},
		},
		'POST /users': {
			request: createUserSchema,
			response: createdUserSchema,
		},
	},
	parse: (schema, data, { phase, params }) => {
		const validate = ajv.compile(schema);
		if (!validate(data)) {
			throw new TypeError(ajv.errorsText(validate.errors));
		}
		if (phase === 'response' && params.id) {
			console.log(`Validated response for user ${params.id}`);
		}
		return data;
	},
});

try {
	const { data: user } = await client.get('/users/1');
	console.log('Fetched user:', user);

	const { data: queryUser } = await client.get('/users?id=1');
	console.log('Fetched user by query parameter:', queryUser);

	const { data: createdUser } = await client.post('/users', {
		name: 'Ada Lovelace',
		email: 'ada@example.com',
	});
	console.log('Created user:', createdUser);
} finally {
	detach();
}
