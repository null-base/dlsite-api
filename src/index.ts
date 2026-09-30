import { Scalar } from '@scalar/hono-api-reference';
import { OpenAPIHono } from '@hono/zod-openapi';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiError } from './errors';
import { DlsiteClient, type Fetcher } from './dlsite/client';
import { createCircleRoutes } from './routes/circles';
import { createRankingRoutes } from './routes/rankings';
import { createSearchRoutes } from './routes/search';
import { createWorksRoutes } from './routes/works';
import { withCache, type ResponseCache } from './cache';

export interface AppOptions {
  fetcher?: Fetcher;
  cache?: ResponseCache;
}

export function createApp(options: AppOptions = {}) {
  const client = new DlsiteClient(options.fetcher);
  const app = new OpenAPIHono();

  app.use('/v1/*', withCache(options.cache));
  app.route('/v1', createWorksRoutes(client));
  app.route('/v1', createSearchRoutes(client));
  app.route('/v1', createCircleRoutes(client));
  app.route('/v1', createRankingRoutes(client));

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json({ error: { code: error.code, message: error.message } }, error.status as ContentfulStatusCode);
    }
    console.error('Unhandled API error', error);
    return c.json({
      error: { code: 'INTERNAL_ERROR' as const, message: 'An unexpected error occurred.' },
    }, 500);
  });

  app.get('/openapi.json', (c) => c.json(app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: 'DLsite Public Metadata API',
      version: '0.1.0',
      description: 'An unofficial REST API that normalizes publicly accessible DLsite metadata.',
    },
    servers: [{ url: '/' }],
  })));

  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'DLsite Public Metadata API' }));

  return app;
}

const app = createApp();
export default app;
