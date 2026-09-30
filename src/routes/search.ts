import { createRoute } from '@hono/zod-openapi';
import type { DlsiteClient } from '../dlsite/client';
import { SearchQuerySchema, SearchResponseSchema } from '../schemas/search';
import { commonErrorResponses, createRouteApp } from './shared';

export function createSearchRoutes(client: DlsiteClient) {
  const app = createRouteApp();
  const route = createRoute({
    method: 'get',
    path: '/search',
    request: { query: SearchQuerySchema },
    responses: {
      200: { description: 'Normalized search results.', content: { 'application/json': { schema: SearchResponseSchema } } },
      ...commonErrorResponses,
    },
  });

  app.openapi(route, async (c) => {
    const query = c.req.valid('query');
    const result = await client.search(query);
    return c.json(SearchResponseSchema.parse({
      query: query.keyword,
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
