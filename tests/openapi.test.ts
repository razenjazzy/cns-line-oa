import { describe, expect, it } from 'vitest';
import { demoSessionRotateBodySchema, healthzResponseSchema, toOpenApiSchema } from '../src/http/openapi/schemas';
import { buildOpenApiDocument } from '../src/http/openapi/document';

describe('OpenAPI / Zod parity', () => {
  it('converts healthz Zod schema into OpenAPI JSON schema with expected fields', () => {
    const schema = toOpenApiSchema(healthzResponseSchema);
    expect(schema).toMatchObject({
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        service: { type: 'string' },
      },
    });
  });

  it('rejects a short demo-session rotate secret', () => {
    expect(demoSessionRotateBodySchema.safeParse({ newSecret: 'short' }).success).toBe(false);
    expect(demoSessionRotateBodySchema.safeParse({ newSecret: '1234567890123456' }).success).toBe(true);
  });

  it('includes ops and job paths generated from Zod', () => {
    const document = buildOpenApiDocument();
    const paths = document.paths as Record<string, unknown>;
    expect(paths['/ops/kpi']).toBeTruthy();
    expect(paths['/ops/platform']).toBeTruthy();
    expect(paths['/ops/demo-session/rotate']).toBeTruthy();
    expect(paths['/jobs/daily-report']).toBeTruthy();
    expect(document.openapi).toBe('3.1.0');
  });
});
