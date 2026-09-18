import { Injectable } from '@nestjs/common';
import type express from 'express';
import type { ChaosConfig, ChaosFailureType, Endpoint, Service } from '@mockingbird/shared-types';

const ALL_FAILURE_TYPES: ChaosFailureType[] = ['http_400', 'http_500', 'http_503', 'timeout', 'connection_reset'];

/**
 * Simulates flaky upstream behavior so consumers can harden their apps against it.
 * An endpoint's own chaos config (when enabled) takes priority over its service's.
 */
@Injectable()
export class ChaosService {
  resolve(service: Service | undefined, endpoint: Endpoint | undefined): ChaosConfig | undefined {
    if (endpoint?.chaos?.enabled) return endpoint.chaos;
    if (service?.chaos?.enabled) return service.chaos;
    return undefined;
  }

  /** Rolls the dice against `uptimePercent`; returns the failure to simulate, or null for a normal response. */
  roll(config: ChaosConfig): ChaosFailureType | null {
    if (Math.random() * 100 < config.uptimePercent) return null;
    const types = config.failureTypes?.length ? config.failureTypes : ALL_FAILURE_TYPES;
    return types[Math.floor(Math.random() * types.length)];
  }

  /** Applies the simulated failure to the response. Returns true if the connection was dropped (no further writes possible). */
  async apply(
    failureType: ChaosFailureType,
    req: express.Request,
    res: express.Response,
    config: ChaosConfig,
  ): Promise<boolean> {
    switch (failureType) {
      case 'http_400':
        res.status(400).json({ error: 'Bad Request (chaos)' });
        return false;
      case 'http_500':
        res.status(500).json({ error: 'Internal Server Error (chaos)' });
        return false;
      case 'http_503':
        res.status(503).json({ error: 'Service Unavailable (chaos)' });
        return false;
      case 'timeout': {
        const min = config.timeoutMinMs ?? 5000;
        const max = Math.max(min, config.timeoutMaxMs ?? 30000);
        const ms = min + Math.random() * (max - min);
        await new Promise<void>(resolve => setTimeout(resolve, ms));
        if (!res.headersSent) res.status(504).json({ error: 'Gateway Timeout (chaos)' });
        return false;
      }
      case 'connection_reset':
        req.socket.destroy();
        return true;
      default:
        return false;
    }
  }

  describe(failureType: ChaosFailureType): string {
    switch (failureType) {
      case 'http_400': return 'Simulated 400 Bad Request';
      case 'http_500': return 'Simulated 500 Internal Server Error';
      case 'http_503': return 'Simulated 503 Service Unavailable';
      case 'timeout': return 'Simulated slow response / timeout (504)';
      case 'connection_reset': return 'Simulated connection reset';
    }
  }
}
