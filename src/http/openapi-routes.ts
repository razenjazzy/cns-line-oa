import type { Express, Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import { requireOpsToken } from '../services/ops-token-auth';
import { isApiDocsEnabled, isProduction } from './env';
import { buildOpenApiDocument } from './openapi/document';

const requireDocsAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!isApiDocsEnabled) {
    return res.status(404).json({ error: 'API docs are disabled.' });
  }
  if (isProduction) {
    return requireOpsToken(req, res, next);
  }
  return next();
};

export const registerOpenApiRoutes = (app: Express): void => {
  const document = buildOpenApiDocument();

  app.get('/api-docs.json', requireDocsAccess, (_req, res) => {
    res.json(document);
  });

  app.use('/api-docs', requireDocsAccess, swaggerUi.serve, swaggerUi.setup(document, {
    swaggerOptions: { persistAuthorization: true },
  }));
};
