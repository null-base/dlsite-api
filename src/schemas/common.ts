import { z } from '@hono/zod-openapi';

export const SiteSchema = z
  .enum(['home', 'maniax', 'books', 'pro', 'soft'])
  .openapi('DlsiteSite');
export type DlsiteSite = z.infer<typeof SiteSchema>;

export const SiteQuerySchema = z.object({
  site: SiteSchema.optional().openapi({
    param: { name: 'site', in: 'query' },
    description: 'DLsite site area. Defaults by product ID or to maniax.',
    example: 'maniax',
  }),
});

export const ErrorCodeSchema = z.enum([
  'INVALID_REQUEST',
  'WORK_NOT_FOUND',
  'CIRCLE_NOT_FOUND',
  'RATE_LIMITED',
  'DLSITE_UPSTREAM_ERROR',
  'DLSITE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: ErrorCodeSchema,
      message: z.string(),
    }),
  })
  .openapi('ErrorResponse');

export const PageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1).openapi({
    param: { name: 'page', in: 'query' },
    description: 'One-based page number.',
    example: 1,
  }),
  limit: z.coerce.number().int().min(1).max(50).default(20).openapi({
    param: { name: 'limit', in: 'query' },
    description: 'Maximum number of works to return (1–50).',
    example: 20,
  }),
});

export const ListMetaSchema = z
  .object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    count: z.number().int().nonnegative(),
    hasMore: z.boolean(),
  })
  .openapi('ListMeta');

export type ApiErrorCode = z.infer<typeof ErrorCodeSchema>;
