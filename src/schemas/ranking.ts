import { z } from '@hono/zod-openapi';
import { ListMetaSchema } from './common';
import { WorkListItemSchema } from './work';

export const RankingQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'year', 'total']).default('day').openapi({
    param: { name: 'period', in: 'query' },
    description: 'Ranking period.',
    example: 'day',
  }),
  page: z.coerce.number().int().min(1).max(100).default(1).openapi({
    param: { name: 'page', in: 'query' },
    example: 1,
  }),
  limit: z.coerce.number().int().min(1).max(50).default(20).openapi({
    param: { name: 'limit', in: 'query' },
    example: 20,
  }),
  site: z.enum(['home', 'maniax', 'books', 'pro', 'soft']).default('maniax').openapi({
    param: { name: 'site', in: 'query' },
    example: 'maniax',
  }),
});

export const RankingResponseSchema = z
  .object({
    period: z.enum(['day', 'week', 'month', 'year', 'total']),
    pagination: ListMetaSchema,
    works: z.array(WorkListItemSchema),
  })
  .openapi('RankingResponse');

export type RankingQuery = z.infer<typeof RankingQuerySchema>;
