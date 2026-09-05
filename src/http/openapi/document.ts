import { demoSessionRotateBodySchema, errorResponseSchema, healthzResponseSchema, jobAcceptedSchema, readyzResponseSchema, toOpenApiSchema } from './schemas';

type OpenApiPath = {
  [method: string]: {
    tags: string[];
    summary: string;
    security?: Array<Record<string, string[]>>;
    parameters?: Array<Record<string, unknown>>;
    requestBody?: Record<string, unknown>;
    responses: Record<string, unknown>;
  };
};

const jsonResponse = (schema: Record<string, unknown>, description: string) => ({
  description,
  content: { 'application/json': { schema } },
});

const bearer = [{ bearerAuth: [] as string[] }];

const opsPaths: Record<string, OpenApiPath> = {
  '/healthz': {
    get: {
      tags: ['health'],
      summary: 'Liveness probe',
      responses: { '200': jsonResponse(toOpenApiSchema(healthzResponseSchema), 'Service is up') },
    },
  },
  '/readyz': {
    get: {
      tags: ['health'],
      summary: 'Readiness probe',
      responses: {
        '200': jsonResponse(toOpenApiSchema(readyzResponseSchema), 'Ready'),
        '503': jsonResponse(toOpenApiSchema(readyzResponseSchema), 'Not ready'),
      },
    },
  },
  '/ops/kpi': {
    get: {
      tags: ['ops'],
      summary: 'KPI snapshot',
      security: bearer,
      responses: {
        '200': { description: 'KPI counters since process start' },
        '401': jsonResponse(toOpenApiSchema(errorResponseSchema), 'Unauthorized'),
      },
    },
  },
  '/ops/audit-log': {
    get: {
      tags: ['ops'],
      summary: 'Recent audit events',
      security: bearer,
      parameters: [
        { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } },
        { name: 'cursor', in: 'query', schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Paged audit events' },
        '401': jsonResponse(toOpenApiSchema(errorResponseSchema), 'Unauthorized'),
      },
    },
  },
  '/ops/audit-log/rotate': {
    post: {
      tags: ['ops'],
      summary: 'Archive and rotate audit log',
      security: bearer,
      responses: { '200': { description: 'Rotation result' }, '401': jsonResponse(toOpenApiSchema(errorResponseSchema), 'Unauthorized') },
    },
  },
  '/ops/demo-session/rotate': {
    post: {
      tags: ['ops'],
      summary: 'Rotate demo session secret',
      security: bearer,
      requestBody: {
        required: true,
        content: { 'application/json': { schema: toOpenApiSchema(demoSessionRotateBodySchema) } },
      },
      responses: { '200': { description: 'Rotated' }, '400': jsonResponse(toOpenApiSchema(errorResponseSchema), 'Invalid body') },
    },
  },
  '/ops/workflow-audit': {
    get: {
      tags: ['ops'],
      summary: 'Security and readiness self-check',
      security: bearer,
      responses: { '200': { description: 'Workflow audit payload' } },
    },
  },
  '/ops/platform': {
    get: {
      tags: ['ops'],
      summary: 'Full platform status (probes, flags, modules)',
      security: bearer,
      responses: { '200': { description: 'Platform status snapshot' } },
    },
  },
  '/jobs/daily-report': {
    post: {
      tags: ['jobs'],
      summary: 'Trigger daily report',
      security: [{ adminAuth: [] }],
      responses: { '200': jsonResponse(toOpenApiSchema(jobAcceptedSchema), 'Triggered or queued') },
    },
  },
  '/jobs/segmentation': {
    post: {
      tags: ['jobs'],
      summary: 'Trigger segmentation job',
      security: [{ adminAuth: [] }],
      responses: { '200': jsonResponse(toOpenApiSchema(jobAcceptedSchema), 'Triggered or queued') },
    },
  },
  '/jobs/seed-odoo': {
    post: {
      tags: ['jobs'],
      summary: 'Seed Odoo sample sales data',
      security: [{ adminAuth: [] }],
      responses: { '200': jsonResponse(toOpenApiSchema(jobAcceptedSchema), 'Triggered or queued') },
    },
  },
};

export const buildOpenApiDocument = (): Record<string, unknown> => ({
  openapi: '3.1.0',
  info: {
    title: 'cns-line-oa ops API',
    version: '1.0.0',
    description: 'Schema-driven OpenAPI generated from Zod. LINE webhooks are not documented here.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'OPS_API_TOKEN' },
      adminAuth: { type: 'http', scheme: 'bearer', description: 'ADMIN_SECRET_TOKEN' },
    },
  },
  paths: opsPaths,
});
