import { z } from '@hono/zod-openapi';

export const CircleSummarySchema = z
  .object({
    id: z.string().nullable(),
    name: z.string().nullable(),
  })
  .openapi('CircleSummary');

export const PriceSchema = z
  .object({
    amount: z.number().nonnegative().nullable(),
    currency: z.literal('JPY'),
  })
  .openapi('Price');

export const RatingSchema = z
  .object({
    average: z.number().min(0).max(5).nullable(),
    count: z.number().int().nonnegative().nullable(),
  })
  .openapi('Rating');

export const WorkImagesSchema = z
  .object({
    main: z.string().url().nullable(),
    samples: z.array(z.string().url()),
  })
  .openapi('WorkImages');

export const WorkSchema = z
  .object({
    id: z.string().openapi({ example: 'RJ01234567' }),
    title: z.string(),
    circle: CircleSummarySchema.nullable(),
    price: PriceSchema,
    rating: RatingSchema,
    releaseDate: z.string().date().nullable(),
    genres: z.array(z.string()),
    images: WorkImagesSchema,
    workType: z.string().nullable(),
    ageRating: z.string().nullable(),
    description: z.string().nullable(),
    url: z.string().url(),
  })
  .openapi('Work');

export const WorkListItemSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    url: z.string().url(),
    image: z.string().url().nullable(),
    price: PriceSchema,
    circle: CircleSummarySchema.nullable(),
  })
  .openapi('WorkListItem');

export type Work = z.infer<typeof WorkSchema>;
export type WorkListItem = z.infer<typeof WorkListItemSchema>;
