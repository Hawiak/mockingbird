import type { WorkflowAction, ResponseBlock, TemplateContext, ResponseContext } from '@mockingbird/shared-types';
import { Response } from 'express';
import { TemplateService } from '../template.service';

export interface RespondResult {
  response: ResponseContext;
}

export async function executeRespond(
  action: WorkflowAction,
  ctx: TemplateContext,
  res: Response,
  responseBlocks: ResponseBlock[],
  templateService: TemplateService,
): Promise<RespondResult> {
  let statusCode = action.statusCode ?? 200;
  let body = '';
  const headers: Record<string, string> = { ...(action.headers ?? {}) };

  if (action.mode === 'block' || (!action.mode && action.responseBlockId)) {
    const block = responseBlocks.find(b => b.id === action.responseBlockId);
    if (block) {
      statusCode = block.statusCode;
      body = templateService.render(block.body ?? '', ctx).output;
      Object.assign(headers, block.headers);
    }
  } else if (action.mode === 'inline') {
    body = action.body ?? '';
  } else if (action.mode === 'template') {
    const rendered = templateService.render(action.body ?? '', ctx);
    body = rendered.output;
  }

  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.status(statusCode).send(body);

  return { response: { statusCode, headers, body } };
}
