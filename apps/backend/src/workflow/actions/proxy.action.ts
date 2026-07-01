import axios from 'axios';
import { Request, Response } from 'express';
import type { WorkflowAction, TemplateContext, ResponseContext } from '@mockingbird/shared-types';

export async function executeProxy(
  action: WorkflowAction,
  _ctx: TemplateContext,
  req: Request,
  res: Response,
): Promise<ResponseContext> {
  const target = action.target!;
  const url =
    target.replace(/\/$/, '') +
    req.path +
    (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');

  const reqHeaders: Record<string, string | string[] | undefined> = {
    ...req.headers,
    ...(action.proxyHeaders ?? {}),
  };
  delete reqHeaders['host'];

  const axiosRes = await axios({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD',
    url,
    headers: reqHeaders as Record<string, string>,
    data: req.body as unknown,
    validateStatus: () => true,
  });

  for (const [k, v] of Object.entries(axiosRes.headers)) {
    if (typeof v === 'string') res.setHeader(k, v);
  }
  res.status(axiosRes.status).send(axiosRes.data as unknown);

  return {
    statusCode: axiosRes.status,
    headers: axiosRes.headers as Record<string, string>,
    body:
      typeof axiosRes.data === 'string'
        ? axiosRes.data
        : JSON.stringify(axiosRes.data),
  };
}
