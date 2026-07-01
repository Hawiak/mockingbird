import { Kafka, Producer, Admin } from 'kafkajs';
import type { TemplateContext } from '@mockingbird/shared-types';
import { MockingbirdModule, HealthResult } from '../module-registry.interface';

export class KafkaModuleImpl implements MockingbirdModule {
  readonly type = 'kafka';
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private config: Record<string, unknown> = {};

  async configure(config: Record<string, unknown>): Promise<void> {
    this.config = config;
    const brokers = config['brokers'] as string[];
    const clientId = (config['clientId'] as string) ?? 'mockingbird';
    const ssl = config['ssl'] as boolean | undefined;
    const sasl = config['sasl'] as
      | { mechanism: string; username: string; password: string }
      | undefined;

    this.kafka = new Kafka({
      clientId,
      brokers,
      ssl: ssl ?? false,
      sasl: sasl
        ? {
            mechanism: sasl.mechanism as any,
            username: sasl.username,
            password: sasl.password,
          }
        : undefined,
    });
    // Lazy connect — no connection opened here
  }

  async execute(params: Record<string, string>, ctx: TemplateContext): Promise<void> {
    if (!this.kafka) throw new Error('Kafka module not configured');

    // Lazy connect with retry
    if (!this.producer) {
      this.producer = this.kafka.producer();
      await this.connectWithRetry();
    }

    await this.producer.send({
      topic: params['topic'] ?? '',
      messages: [{ key: params['key'] || null, value: params['payload'] ?? '' }],
    });
  }

  async healthCheck(): Promise<HealthResult> {
    if (!this.kafka) return { healthy: false, message: 'Not configured' };
    const start = Date.now();
    const admin: Admin = this.kafka.admin();
    try {
      await admin.connect();
      await admin.listTopics();
      await admin.disconnect();
      return { healthy: true, latencyMs: Date.now() - start };
    } catch (e: unknown) {
      return { healthy: false, message: (e as Error).message };
    }
  }

  private async connectWithRetry(attempt = 0): Promise<void> {
    const delays = [1000, 2000, 4000];
    try {
      await this.producer!.connect();
    } catch (e) {
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, delays[attempt] ?? 4000));
        return this.connectWithRetry(attempt + 1);
      }
      throw e;
    }
  }
}
