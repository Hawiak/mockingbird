import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
import { load } from 'js-yaml';
import type { Service, ParsedSpec, ParsedEndpoint, ParsedParameter } from '@mockingbird/shared-types';
import { ResponseGeneratorService } from './response-generator.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SwaggerParser = require('@apidevtools/swagger-parser');

export class SpecChangedEvent {
  constructor(
    public readonly serviceId: string,
    public readonly spec: ParsedSpec,
  ) {}
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;

type PathItem = Record<string, unknown>;
type OasDocument = { paths?: Record<string, PathItem> };
type OperationLike = {
  responses?: Record<string, unknown>;
  parameters?: unknown[];
  operationId?: string;
};

/**
 * Loads and parses OpenAPI specs. `type: 'url'` fetches fresh over the network on every
 * load()/refresh(); `type: 'upload' | 'hosted'` reads the raw spec text directly from
 * `service.spec.specContent`, which lives in mockingbird.yaml — no separate on-disk
 * cache, so an uploaded/hosted spec travels with the config file. `specHashes` is purely
 * an in-memory, same-process dedup for the url-refresh interval; it's never a source of
 * truth and doesn't need to survive a restart.
 */
@Injectable()
export class SwaggerLoaderService implements OnModuleDestroy {
  private readonly logger = new Logger(SwaggerLoaderService.name);
  private readonly specHashes = new Map<string, string>();
  private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly responseGenerator: ResponseGeneratorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleDestroy(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
  }

  isLoaded(serviceId: string): boolean {
    return this.specHashes.has(serviceId);
  }

  async load(service: Service): Promise<ParsedSpec> {
    if (service.spec.type === 'url' && service.spec.url) {
      const raw = await this.fetchSpec(service);
      const spec = await this.buildParsedSpec(service.id, raw);
      this.startRefreshInterval(service);
      return spec;
    }

    // upload / hosted → raw spec text lives directly on the service, in mockingbird.yaml
    if (!service.spec.specContent) {
      throw new Error(`No spec content stored for service ${service.id}`);
    }
    return this.buildParsedSpec(service.id, service.spec.specContent);
  }

  async refresh(service: Service): Promise<ParsedSpec | null> {
    if (service.spec.type !== 'url' || !service.spec.url) return null;

    let raw: string;
    try {
      raw = await this.fetchSpec(service);
    } catch (e: unknown) {
      this.logger.warn(`Refresh fetch failed for ${service.name}: ${(e as Error).message}`);
      return null;
    }

    const hash = createHash('sha256').update(raw).digest('hex');
    if (hash === this.specHashes.get(service.id)) return null;

    const spec = await this.buildParsedSpec(service.id, raw);
    this.eventEmitter.emit('spec.changed', new SpecChangedEvent(service.id, spec));
    this.logger.log(`Spec changed for ${service.name}`);
    return spec;
  }

  private async fetchSpec(service: Service): Promise<string> {
    const headers = service.spec.headers ?? {};
    const response = await axios.get<string>(service.spec.url!, {
      headers,
      responseType: 'text',
      timeout: 10_000,
    });
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
  }

  private async parseSpec(raw: string): Promise<OasDocument> {
    const document = load(raw);
    const api = await SwaggerParser.dereference(document) as OasDocument;
    return api;
  }

  private async buildParsedSpec(serviceId: string, rawSpec: string): Promise<ParsedSpec> {
    const hash = createHash('sha256').update(rawSpec).digest('hex');
    this.specHashes.set(serviceId, hash);

    const api = await this.parseSpec(rawSpec);
    const endpoints: ParsedEndpoint[] = [];
    const paths = api.paths ?? {};

    for (const [rawPath, pathItem] of Object.entries(paths)) {
      if (!pathItem) continue;
      const expressPath = rawPath.replace(/\{([^}]+)\}/g, ':$1');

      for (const method of HTTP_METHODS) {
        const operation = pathItem[method] as OperationLike | undefined;
        if (!operation || typeof operation !== 'object') continue;

        const operationRecord = operation as Record<string, unknown>;
        const defaultValues = this.responseGenerator.generateDefaultValues(operationRecord);
        const parameters = this.extractParameters(operation, pathItem);

        const endpointId = `${serviceId}_${method.toUpperCase()}_${rawPath.replace(/[{}/:]/g, '_')}`;
        endpoints.push({
          method: method.toUpperCase(),
          path: expressPath,
          defaultStatusCode: defaultValues.statusCode,
          defaultContentType: defaultValues.contentType,
          defaultBody: defaultValues.body,
          defaultHeaders: defaultValues.headers,
          parameters,
        });

        this.logger.debug(`Registered endpoint: ${endpointId}`);
      }
    }

    return { serviceId, specHash: hash, endpoints };
  }

  private extractParameters(operation: OperationLike, pathItem: PathItem): ParsedParameter[] {
    const allParams = [
      ...((pathItem['parameters'] as unknown[] | undefined) ?? []),
      ...((operation.parameters ?? []) as unknown[]),
    ];

    return allParams
      .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
      .map((p): ParsedParameter => ({
        name: String(p['name'] ?? ''),
        in: (p['in'] as 'path' | 'query' | 'header' | 'cookie') ?? 'query',
        required: Boolean(p['required'] ?? false),
        schema: p['schema'] as Record<string, unknown> | undefined,
      }));
  }

  private startRefreshInterval(service: Service): void {
    if (this.intervals.has(service.id)) return;

    const intervalSeconds = service.spec.refreshIntervalSeconds ?? 300;
    if (intervalSeconds <= 0) return;

    const interval = setInterval(async () => {
      await this.refresh(service);
    }, intervalSeconds * 1000);

    this.intervals.set(service.id, interval);
  }
}
