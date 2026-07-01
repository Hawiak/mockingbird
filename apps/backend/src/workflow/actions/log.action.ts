import { Logger } from '@nestjs/common';
import type { WorkflowAction, TemplateContext, WorkflowLogEntry } from '@mockingbird/shared-types';
import { TemplateService } from '../template.service';

const logger = new Logger('WorkflowLog');

export async function executeLog(
  action: WorkflowAction,
  ctx: TemplateContext,
  templateService: TemplateService,
): Promise<WorkflowLogEntry> {
  const start = Date.now();
  const { output } = templateService.render(action.message ?? '', ctx);
  logger.log(output);
  return { action: 'log', status: 'ok', message: output, durationMs: Date.now() - start };
}
