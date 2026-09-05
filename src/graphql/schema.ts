import { GraphQLError, GraphQLObjectType, GraphQLSchema, GraphQLString, GraphQLInt, GraphQLNonNull, GraphQLScalarType, Kind } from 'graphql';
import { getKpiSnapshot } from '../services/kpi';
import { listRecentAuditEventsPage } from '../services/firestore';
import { parseAuditLogFilters, decodeAuditCursor } from '../services/audit-query';
import { runAuditRotationJob } from '../jobs/audit-rotation';
import { runDailyReport } from '../jobs/daily-report';
import { seedOdooSampleSalesData } from '../services/odoo';
import { ensureDemoSessionStateLoaded, rotateDemoSessionSecret } from '../http/demo-session';
import { buildWorkflowAudit } from '../http/workflow-audit';
import { demoSessionRotateGraceDefaultMinutes, isOpsJobsAsync } from '../http/env';
import { enqueueOpsJob } from '../jobs/queue';
import { getDemoPlatformPayload } from '../platform/service-modules';
import { getPlatformStatus } from '../platform/status';

const GraphQLJSON = new GraphQLScalarType({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  parseValue: (value) => value,
  serialize: (value) => value,
  parseLiteral: (ast) => (ast.kind === Kind.STRING ? ast.value : null),
});

export type GraphqlContext = {
  opsOk: boolean;
  adminOk: boolean;
};

const requireOps = (ctx: GraphqlContext): void => {
  if (!ctx.opsOk) {
    throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED' } });
  }
};

const requireAdmin = (ctx: GraphqlContext): void => {
  if (!ctx.adminOk) {
    throw new GraphQLError('Unauthorized', { extensions: { code: 'UNAUTHENTICATED' } });
  }
};

const runOrEnqueueJob = async (name: 'daily-report' | 'segmentation' | 'seed-odoo' | 'audit-rotate', run: () => Promise<unknown>): Promise<unknown> => {
  if (isOpsJobsAsync) {
    const jobId = await enqueueOpsJob(name);
    return { ok: true, accepted: true, jobId };
  }
  return run();
};

const Query = new GraphQLObjectType({
  name: 'Query',
  fields: {
    healthz: {
      type: GraphQLJSON,
      resolve: () => ({
        ok: true,
        service: 'cns-line-oa',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
      }),
    },
    kpi: {
      type: GraphQLJSON,
      resolve: (_src, _args, ctx: GraphqlContext) => {
        requireOps(ctx);
        return getKpiSnapshot();
      },
    },
    workflowAudit: {
      type: GraphQLJSON,
      resolve: async (_src, _args, ctx: GraphqlContext) => {
        requireOps(ctx);
        await ensureDemoSessionStateLoaded();
        return buildWorkflowAudit();
      },
    },
    auditLog: {
      type: GraphQLJSON,
      args: { limit: { type: GraphQLInt }, cursor: { type: GraphQLString } },
      resolve: async (_src, args: { limit?: number; cursor?: string }, ctx: GraphqlContext) => {
        requireOps(ctx);
        const page = await listRecentAuditEventsPage(
          args.limit || 50,
          parseAuditLogFilters({}),
          decodeAuditCursor(args.cursor),
        );
        return { ...page, count: page.events.length };
      },
    },
    platformModules: {
      type: GraphQLJSON,
      resolve: (_src, _args, ctx: GraphqlContext) => {
        requireOps(ctx);
        return getDemoPlatformPayload();
      },
    },
    platformStatus: {
      type: GraphQLJSON,
      resolve: async (_src, _args, ctx: GraphqlContext) => {
        requireOps(ctx);
        return getPlatformStatus();
      },
    },
  },
});

const Mutation = new GraphQLObjectType({
  name: 'Mutation',
  fields: {
    rotateAuditLog: {
      type: GraphQLJSON,
      resolve: async (_src, _args, ctx: GraphqlContext) => {
        requireOps(ctx);
        return runOrEnqueueJob('audit-rotate', () => runAuditRotationJob('graphql'));
      },
    },
    rotateDemoSession: {
      type: GraphQLJSON,
      args: {
        newSecret: { type: new GraphQLNonNull(GraphQLString) },
        graceMinutes: { type: GraphQLInt },
      },
      resolve: async (_src, args: { newSecret: string; graceMinutes?: number }, ctx: GraphqlContext) => {
        requireOps(ctx);
        await ensureDemoSessionStateLoaded();
        return rotateDemoSessionSecret(args.newSecret, args.graceMinutes ?? demoSessionRotateGraceDefaultMinutes);
      },
    },
    triggerDailyReport: {
      type: GraphQLJSON,
      resolve: async (_src, _args, ctx: GraphqlContext) => {
        requireAdmin(ctx);
        return runOrEnqueueJob('daily-report', async () => {
          await runDailyReport();
          return { ok: true, message: 'Daily report triggered successfully' };
        });
      },
    },
    triggerSegmentation: {
      type: GraphQLJSON,
      resolve: async (_src, _args, ctx: GraphqlContext) => {
        requireAdmin(ctx);
        return runOrEnqueueJob('segmentation', async () => {
          const { runSegmentationJob } = await import('../jobs/segmentation');
          await runSegmentationJob();
          return { ok: true, message: 'Segmentation job triggered successfully' };
        });
      },
    },
    triggerSeedOdoo: {
      type: GraphQLJSON,
      resolve: async (_src, _args, ctx: GraphqlContext) => {
        requireAdmin(ctx);
        return runOrEnqueueJob('seed-odoo', async () => {
          const status = await seedOdooSampleSalesData();
          return { ok: true, message: status };
        });
      },
    },
  },
});

export const graphqlSchema = new GraphQLSchema({ query: Query, mutation: Mutation });
