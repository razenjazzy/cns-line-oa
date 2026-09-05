import type { Express, Request } from 'express';
import { graphqlSchema, type GraphqlContext } from '../graphql/schema';
import { isValidAdminToken } from '../services/admin-token-auth';
import { getOpsBearerOrHeaderToken, isValidOpsToken } from '../services/ops-token-auth';
import { isGraphqlEnabled, isGraphiqlEnabled } from './env';
import { appLogger } from '../services/logger';

const contextFromRequest = (req: Request): GraphqlContext => {
  const opsToken = getOpsBearerOrHeaderToken(req);
  const bearer = req.get('authorization')?.startsWith('Bearer ') ? req.get('authorization')!.substring(7) : '';
  return {
    opsOk: isValidOpsToken(opsToken),
    adminOk: isValidAdminToken(bearer),
  };
};

export const registerGraphqlRoutes = async (app: Express): Promise<void> => {
  if (!isGraphqlEnabled) return;

  const { createYoga } = await import('graphql-yoga');
  const yoga = createYoga({
    schema: graphqlSchema,
    graphqlEndpoint: '/graphql',
    graphiql: isGraphiqlEnabled,
    context: ({ request }) => {
      const authorization = request.headers.get('authorization') || '';
      const xOps = request.headers.get('x-ops-token') || '';
      const fakeReq = {
        get: (name: string) => {
          const lower = name.toLowerCase();
          if (lower === 'authorization') return authorization;
          if (lower === 'x-ops-token') return xOps;
          return undefined;
        },
      } as Request;
      return contextFromRequest(fakeReq);
    },
  });

  app.use(yoga.graphqlEndpoint, yoga);
  appLogger.info('graphql_mounted', { endpoint: yoga.graphqlEndpoint });
};
