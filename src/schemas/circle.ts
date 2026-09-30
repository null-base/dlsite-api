import { z } from '@hono/zod-openapi';
import { ListMetaSchema } from './common';
import { CircleSummarySchema, WorkListItemSchema } from './work';

export const CircleSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    url: z.string().url(),
    description: z.string().nullable(),
  })
  .openapi('Circle');

export const CircleWorksResponseSchema = z
  .object({
    circle: CircleSummarySchema,
    pagination: ListMetaSchema,
    works: z.array(WorkListItemSchema),
  })
  .openapi('CircleWorksResponse');

export type Circle = z.infer<typeof CircleSchema>;
