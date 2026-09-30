import { OpenAPIHono } from '@hono/zod-openapi';
import { ErrorResponseSchema } from '../schemas/common';

export function validationErrorHook(result: { success: boolean }, c: { json: (value: unknown, status: 400) => Response }) {
  if (!result.success) {
    return c.json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'One or more request parameters are invalid.',
      },
    }, 400);
  }
  return undefined;
}

export function createRouteApp() {
  return new OpenAPIHono({ defaultHook: validationErrorHook });
}

export const commonErrorResponses = {
  400: { description: 'Invalid request.', content: { 'application/json': { schema: ErrorResponseSchema } } },
  429: { description: 'DLsite rate limited the request.', content: { 'application/json': { schema: ErrorResponseSchema } } },
  502: { description: 'DLsite returned an invalid or unexpected response.', content: { 'application/json': { schema: ErrorResponseSchema } } },
  503: { description: 'DLsite is unavailable.', content: { 'application/json': { schema: ErrorResponseSchema } } },
  500: { description: 'Unexpected API error.', content: { 'application/json': { schema: ErrorResponseSchema } } },
} as const;
