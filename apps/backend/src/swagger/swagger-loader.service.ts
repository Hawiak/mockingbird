import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import axios from 'axios';
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

@Injectable()
export class SwaggerLoaderService implements OnModuleDestroy {
  private readonly logger = new Logger(SwaggerLoaderService.name);
  private readonly cacheDir: string;
  private readonly specHashes = new Map<string, string>();
  private readonly intervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    private readonly responseGenerator: ResponseGeneratorService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.cacheDir = process.env.CACHE_DIR ?? '.mockingbird-cache';
    mkdirSync(join(this.cacheDir, 'specs'), { recursive: true });
  }

  onModuleDestroy(): void {
    for (const interval of this.intervals.values()) {
      clearInterval(interval);
    }
  }

  isLoaded(serviceId: string): boolean {
    return this.specHashes.has(serviceId);
  }

  /** Persists raw spec text (from an upload) so load() can read it from cache. */
  saveSpecContent(serviceId: string, content: string): void {
    writeFileSync(this.cachePath(serviceId), content, 'utf8');
  }

  async load(service: Service): Promise<ParsedSpec> {
    const cachePath = this.cachePath(service.id);

    if (service.spec.type === 'url' && service.spec.url) {
      try {
        const raw = await this.fetchSpec(service);
        writeFileSync(cachePath, raw, 'utf8');
        const parsed = await this.parseSpec(cachePath);
        const spec = this.buildParsedSpec(service.id, parsed, raw);
        this.startRefreshInterval(service);
        return spec;
      } catch (e: unknown) {
        this.logger.warn(`Fetch failed for ${service.name}: ${(e as Error).message}. Using cache.`);
        if (!existsSync(cachePath)) throw new Error(`No cache for service ${service.id}`);
      }
    }

    // upload / hosted → read from cache
    if (!existsSync(cachePath)) {
      throw new Error(`Cache file not found for service ${service.id}: ${cachePath}`);
    }

    const raw = readFileSync(cachePath, 'utf8');
    const parsed = await this.parseSpec(cachePath);
    return this.buildParsedSpec(service.id, parsed, raw);
  }

  async refresh(service: Service): Promise<ParsedSpec | null> {
    if (service.spec.type !== 'url' || !service.spec.url) return null;

    const cachePath = this.cachePath(service.id);
    let raw: string;
    try {
      raw = await this.fetchSpec(service);
    } catch (e: unknown) {
      this.logger.warn(`Refresh fetch failed for ${service.name}: ${(e as Error).message}`);
      return null;
    }

    const hash = createHash('sha256').update(raw).digest('hex');
    if (hash === this.specHashes.get(service.id)) return null;

    this.specHashes.set(service.id, hash);
    writeFileSync(cachePath, raw, 'utf8');
    const parsed = await this.parseSpec(cachePath);
    const spec = this.buildParsedSpec(service.id, parsed, raw);
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

  private async parseSpec(filePath: string): Promise<OasDocument> {
    const api = await SwaggerParser.dereference(filePath) as OasDocument;
    return api;
  }

  private cachePath(serviceId: string): string {
    return join(this.cacheDir, 'specs', `${serviceId}.json`);
  }

  private buildParsedSpec(serviceId: string, api: OasDocument, rawSpec: string): ParsedSpec {
    const hash = createHash('sha256').update(rawSpec).digest('hex');
    this.specHashes.set(serviceId, hash);

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
