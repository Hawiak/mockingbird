import axios, { AxiosInstance } from 'axios';
import type {
  TemplateContext,
  HttpModuleConfig,
  BearerAuth,
  BasicAuth,
  ApiKeyAuth,
} from '@mockingbird/shared-types';
import { MockingbirdModule, HealthResult } from '../module-registry.interface';

export class HttpModuleImpl implements MockingbirdModule {
  readonly type = 'http';
  private client: AxiosInstance | null = null;
  private baseUrl = '';

  async configure(config: Record<string, unknown>): Promise<void> {
    const cfg = config as unknown as HttpModuleConfig;
    this.baseUrl = cfg.baseUrl;
    const headers: Record<string, string> = { ...(cfg.headers ?? {}) };

    if (cfg.auth) {
      const auth = cfg.auth;
      if (auth.type === 'bearer') {
        headers['Authorization'] = `Bearer ${(auth as BearerAuth).token}`;
      } else if (auth.type === 'basic') {
        const { username, password } = auth as BasicAuth;
        headers['Authorization'] =
          'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
      } else if (auth.type === 'apikey') {
        const a = auth as ApiKeyAuth;
        headers[a.header] = a.value;
      }
    }

    this.client = axios.create({
      baseURL: cfg.baseUrl,
      timeout: cfg.timeout ?? 10000,
      headers,
    });
  }

  async execute(params: Record<string, string>, ctx: TemplateContext): Promise<void> {
    if (!this.client) throw new Error('HTTP module not configured');
    await this.client.request({
      method: (params['method'] ?? 'POST') as any,
      url: params['url'] ?? '/',
      headers: params['headers'] ? JSON.parse(params['headers']) : undefined,
      data: params['body'],
      validateStatus: () => true,
    });
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.client) return { healthy: false, message: 'Not configured' };
    const start = Date.now();
    try {
      const res = await this.client.head('/', { timeout: 2000, validateStatus: () => true });
      return { healthy: res.status < 500, latencyMs: Date.now() - start };
    } catch (e: unknown) {
      return { healthy: false, message: (e as Error).message };
    }
  }
}
