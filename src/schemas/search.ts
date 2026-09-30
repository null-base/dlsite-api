import { z } from '@hono/zod-openapi';
import { ListMetaSchema } from './common';
import { WorkListItemSchema } from './work';

export const SearchQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(100).openapi({
    param: { name: 'keyword', in: 'query' },
    description: 'Keyword to search for.',
    example: 'ASMR',
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
  sort: z.enum(['trend', 'release_d', 'dl_d', 'price_d', 'price_a']).default('trend').openapi({
    param: { name: 'sort', in: 'query' },
    description: 'DLsite sort key: trending, newest, sales, price descending, or price ascending.',
    example: 'trend',
  }),
});

export const SearchResponseSchema = z
  .object({
    query: z.string(),
    pagination: ListMetaSchema,
    works: z.array(WorkListItemSchema),
  })
  .openapi('SearchResponse');

export type SearchQuery = z.infer<typeof SearchQuerySchema>;
