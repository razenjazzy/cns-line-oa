import { z } from 'zod';

export const healthzResponseSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  environment: z.string(),
  timestamp: z.string(),
});

export const readyzCheckSchema = z.object({
  name: z.string(),
  ok: z.boolean(),
  message: z.string(),
  required: z.boolean().optional(),
});

export const readyzResponseSchema = z.object({
  ready: z.boolean(),
  checks: z.array(readyzCheckSchema),
  flags: z.record(z.string(), z.unknown()).optional(),
  warnings: z.array(z.string()).optional(),
  uptimeSeconds: z.number(),
  timestamp: z.string(),
});

export const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export const demoSessionRotateBodySchema = z.object({
  newSecret: z.string().min(16),
  graceMinutes: z.coerce.number().optional(),
});

export const errorResponseSchema = z.object({
  error: z.string(),
});

export const jobAcceptedSchema = z.object({
  ok: z.boolean(),
  accepted: z.boolean().optional(),
  jobId: z.string().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
});

export const toOpenApiSchema = (schema: z.ZodType): Record<string, unknown> => {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
};
