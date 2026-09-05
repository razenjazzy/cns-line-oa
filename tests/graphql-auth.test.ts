import { graphql, GraphQLError } from 'graphql';
import { describe, expect, it } from 'vitest';
import { graphqlSchema, type GraphqlContext } from '../src/graphql/schema';

describe('GraphQL ops schema auth', () => {
  it('rejects kpi without an ops token', async () => {
    const result = await graphql({
      schema: graphqlSchema,
      source: '{ kpi }',
      contextValue: { opsOk: false, adminOk: false } satisfies GraphqlContext,
    });
    expect(result.errors?.[0]).toBeInstanceOf(GraphQLError);
    expect(result.errors?.[0]?.message).toBe('Unauthorized');
  });

  it('allows healthz without tokens', async () => {
    const result = await graphql({
      schema: graphqlSchema,
      source: '{ healthz }',
      contextValue: { opsOk: false, adminOk: false } satisfies GraphqlContext,
    });
    expect(result.errors).toBeUndefined();
    expect((result.data?.healthz as { ok?: boolean }).ok).toBe(true);
  });

  it('rejects platformStatus without an ops token', async () => {
    const result = await graphql({
      schema: graphqlSchema,
      source: '{ platformStatus }',
      contextValue: { opsOk: false, adminOk: false } satisfies GraphqlContext,
    });
    expect(result.errors?.[0]?.message).toBe('Unauthorized');
  });

  it('returns the service catalog when ops auth is present', async () => {
    const result = await graphql({
      schema: graphqlSchema,
      source: '{ platformModules }',
      contextValue: { opsOk: true, adminOk: false } satisfies GraphqlContext,
    });
    expect(result.errors).toBeUndefined();
    const payload = result.data?.platformModules as { modules?: Array<{ id: string }> };
    expect(payload.modules?.some(mod => mod.id === 'commerce')).toBe(true);
  });
});
