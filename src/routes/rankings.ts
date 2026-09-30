import { createRoute } from '@hono/zod-openapi';
import type { DlsiteClient } from '../dlsite/client';
import { RankingQuerySchema, RankingResponseSchema } from '../schemas/ranking';
import { commonErrorResponses, createRouteApp } from './shared';

export function createRankingRoutes(client: DlsiteClient) {
  const app = createRouteApp();
  const route = createRoute({
    method: 'get',
    path: '/rankings',
    request: { query: RankingQuerySchema },
    responses: {
      200: { description: 'Normalized ranked works.', content: { 'application/json': { schema: RankingResponseSchema } } },
      ...commonErrorResponses,
    },
  });

  app.openapi(route, async (c) => {
    const query = c.req.valid('query');
    const result = await client.getRankings(query);
    return c.json(RankingResponseSchema.parse({
      period: query.period,
      pagination: {
        page: query.page,
        limit: query.limit,
        count: result.works.length,
        hasMore: result.hasMore,
      },
      works: result.works,
    }), 200);
  });
  return app;
}
