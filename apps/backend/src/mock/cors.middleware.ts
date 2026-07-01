import type { CorsConfig } from '@mockingbird/shared-types';
import type { Request, Response, NextFunction } from 'express';

export function createCorsMiddleware(cors: CorsConfig | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!cors?.enabled) {
      next();
      return;
    }

    const origin = cors.allowOrigins?.length ? cors.allowOrigins.join(',') : '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader(
      'Access-Control-Allow-Methods',
      (cors.allowMethods ?? ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']).join(','),
    );
    res.setHeader('Access-Control-Allow-Headers', (cors.allowHeaders ?? ['*']).join(','));

    if (cors.exposeHeaders?.length) {
      res.setHeader('Access-Control-Expose-Headers', cors.exposeHeaders.join(','));
    }
    if (cors.allowCredentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (cors.maxAge) {
      res.setHeader('Access-Control-Max-Age', String(cors.maxAge));
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}
