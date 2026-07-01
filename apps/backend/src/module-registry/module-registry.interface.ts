import type { TemplateContext } from '@mockingbird/shared-types';

export interface HealthResult {
  healthy: boolean;
  message?: string;
  latencyMs?: number;
}

export interface MockingbirdModule {
  readonly type: string;
  configure(config: Record<string, unknown>): Promise<void>;
  execute(params: Record<string, string>, ctx: TemplateContext): Promise<void>;
  healthCheck(): Promise<HealthResult>;
}
