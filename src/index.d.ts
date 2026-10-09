import type {
	AxiosInstance,
	AxiosRequestConfig,
	AxiosResponse,
} from 'axios';

export type SchemaDefinition = unknown;
export type URLParams = Record<string, string>;
export type DetachFunction = () => void;

export interface SchemaRoute<
	URLParamsSchema = SchemaDefinition,
	RequestSchema = SchemaDefinition,
	ResponseSchema = SchemaDefinition
> {
	urlParams?: URLParamsSchema;
	request?: RequestSchema;
	response?: ResponseSchema;
}

export interface URLParamsParseContext<Params extends URLParams = URLParams> {
	phase: 'urlParams';
	config: AxiosRequestConfig;
	params: Params;
}

export interface RequestParseContext<Params extends URLParams = URLParams> {
	phase: 'request';
	config: AxiosRequestConfig;
	params: Params;
}

export interface ResponseParseContext<Params extends URLParams = URLParams> {
	phase: 'response';
	config: AxiosRequestConfig;
	response: AxiosResponse;
	params: Params;
}

export type SchemaParseContext<Params extends URLParams = URLParams> =
	| URLParamsParseContext<Params>
	| RequestParseContext<Params>
	| ResponseParseContext<Params>;

type RouteSchemaKeys = 'urlParams' | 'request' | 'response';

type RouteSchemas<Routes extends Record<string, SchemaRoute>> = {
	[RouteKey in keyof Routes]: {
		[SchemaKey in keyof Routes[RouteKey] & RouteSchemaKeys]:
			Exclude<Routes[RouteKey][SchemaKey], undefined>;
	}[keyof Routes[RouteKey] & RouteSchemaKeys];
}[keyof Routes];

export interface SchemaMiddlewareOptions<
	Routes extends Record<string, SchemaRoute> = Record<string, SchemaRoute>,
	Data = unknown,
	Params extends URLParams = URLParams,
> {
	routes: Routes;
	parse: (
		schema: RouteSchemas<Routes>,
		data: Data,
		context: SchemaParseContext<Params>,
	) => Data | Promise<Data>;
}

export function createSchemaMiddleware<
	Data = unknown,
	Routes extends Record<string, SchemaRoute> = Record<string, SchemaRoute>,
	Params extends URLParams = URLParams,
>(
	client: AxiosInstance,
	options: SchemaMiddlewareOptions<Routes, Data, Params>,
): DetachFunction;
