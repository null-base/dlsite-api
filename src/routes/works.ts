import { createRoute, z } from '@hono/zod-openapi';
import type { DlsiteClient } from '../dlsite/client';
import { SiteQuerySchema, ErrorResponseSchema } from '../schemas/common';
import { WorkSchema } from '../schemas/work';
import { commonErrorResponses, createRouteApp } from './shared';

const ProductIdParamsSchema = z.object({
  productId: z.string()
    .regex(/^(RJ|VJ|BJ|EB|AC|RE|VT)\d{5,10}$/i)
    .openapi({ param: { name: 'productId', in: 'path' }, example: 'RJ01234567' }),
});

export function createWorksRoutes(client: DlsiteClient) {
  const app = createRouteApp();
  const route = createRoute({
    method: 'get',
    path: '/works/{productId}',
    request: { params: ProductIdParamsSchema, query: SiteQuerySchema },
    responses: {
      200: { description: 'Normalized public work data.', content: { 'application/json': { schema: WorkSchema } } },
      404: { description: 'Work not found.', content: { 'application/json': { schema: ErrorResponseSchema } } },
      ...commonErrorResponses,
    },
  });

  app.openapi(route, async (c) => {
    const { productId } = c.req.valid('param');
    const { site } = c.req.valid('query');
    return c.json(await client.getWork(productId.toUpperCase(), site), 200);
  });
  return app;
}
