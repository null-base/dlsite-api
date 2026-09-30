import { createRoute } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import type { DlsiteClient } from '../dlsite/client';
import { PageQuerySchema, SiteQuerySchema, ErrorResponseSchema } from '../schemas/common';
import { CircleSchema, CircleWorksResponseSchema } from '../schemas/circle';
import { commonErrorResponses, createRouteApp } from './shared';

const MakerParamsSchema = z.object({
  makerId: z.string().regex(/^[A-Z]{2}\d{4,12}$/i)
    .openapi({ param: { name: 'makerId', in: 'path' }, example: 'RG01032287' }),
});
const CircleSiteQuerySchema = z.object({ site: SiteQuerySchema.shape.site.default('maniax') });
const CircleWorksQuerySchema = PageQuerySchema.extend({ site: SiteQuerySchema.shape.site.default('maniax') });

export function createCircleRoutes(client: DlsiteClient) {
  const app = createRouteApp();
  const circleRoute = createRoute({
    method: 'get',
    path: '/circles/{makerId}',
    request: { params: MakerParamsSchema, query: CircleSiteQuerySchema },
    responses: {
      200: { description: 'Normalized circle profile.', content: { 'application/json': { schema: CircleSchema } } },
      404: { description: 'Circle not found.', content: { 'application/json': { schema: ErrorResponseSchema } } },
      ...commonErrorResponses,
    },
  });
  const worksRoute = createRoute({
    method: 'get',
    path: '/circles/{makerId}/works',
    request: { params: MakerParamsSchema, query: CircleWorksQuerySchema },
    responses: {
      200: { description: 'Normalized works published by the circle.', content: { 'application/json': { schema: CircleWorksResponseSchema } } },
      404: { description: 'Circle not found.', content: { 'application/json': { schema: ErrorResponseSchema } } },
      ...commonErrorResponses,
    },
  });

  app.openapi(circleRoute, async (c) => {
    const { makerId } = c.req.valid('param');
    const { site } = c.req.valid('query');
    return c.json(CircleSchema.parse(await client.getCircle(makerId, site)), 200);
  });

  app.openapi(worksRoute, async (c) => {
    const { makerId } = c.req.valid('param');
    const { site, page, limit } = c.req.valid('query');
    const result = await client.getCircleWorks(makerId, site, page, limit);
    return c.json(CircleWorksResponseSchema.parse({
      circle: { id: result.circle.id, name: result.circle.name },
      pagination: { page, limit, count: result.works.length, hasMore: result.hasMore },
      works: result.works,
    }), 200);
  });
  return app;
}
