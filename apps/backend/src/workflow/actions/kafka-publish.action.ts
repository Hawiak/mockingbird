import type {
  WorkflowAction,
  TemplateContext,
  ModuleConfig,
  KafkaModuleConfig,
} from '@mockingbird/shared-types';
import { TemplateService } from '../template.service';

export interface ResolvedKafkaPublish {
  topic: string;
  key: string;
  payload: string;
}

/**
 * Resolves a kafka_publish action's topic/key/payload, substituting in the
 * referenced message block (if any) before rendering everything through the
 * template engine.
 */
export function resolveKafkaPublish(
  action: WorkflowAction,
  ctx: TemplateContext,
  modules: ModuleConfig[],
  templateService: TemplateService,
): ResolvedKafkaPublish {
  let keyTemplate = action.key ?? '';
  let payloadTemplate = action.payload ?? '';

  if (action.mode === 'block' && action.messageBlockId) {
    const mod = modules.find(m => m.id === action.module);
    const block = (mod?.config as KafkaModuleConfig | undefined)?.messageBlocks?.find(
      b => b.id === action.messageBlockId,
    );
    if (block) {
      payloadTemplate = block.payload;
      if (block.key) keyTemplate = block.key;
    }
  }

  return {
    topic: templateService.render(action.topic ?? '', ctx).output,
    key: templateService.render(keyTemplate, ctx).output,
    payload: templateService.render(payloadTemplate, ctx).output,
  };
}
