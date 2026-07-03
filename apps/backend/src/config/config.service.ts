import { Injectable, Logger } from '@nestjs/common';
import { readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { load, dump } from 'js-yaml';
import type { Config, ParsedEndpoint, KafkaModuleConfig } from '@mockingbird/shared-types';

@Injectable()
export class ConfigService {
  private readonly logger = new Logger(ConfigService.name);
  private current: Config | null = null;
  private configPath = '';

  async load(path: string): Promise<Config> {
    this.configPath = path;
    const raw = readFileSync(path, 'utf8');
    const parsed = (raw.trim() === '' ? {} : (load(raw) ?? {})) as Config;
    const resolved = this.resolveEnvVars(parsed) as Config;
    // Ensure every top-level list/object exists even if absent or the file was empty
    resolved.version ??= '1';
    resolved.settings ??= { uiPort: 9000 };
    resolved.services ??= [];
    resolved.modules ??= [];
    resolved.parameterSets ??= [];
    resolved.responseBlocks ??= [];
    resolved.responseWorkflows ??= [];
    resolved.savedConditions ??= [];
    for (const svc of resolved.services ?? []) {
      svc.endpoints ??= [];
      for (const ep of svc.endpoints) {
        ep.statements ??= [];
      }
    }

    // Seed a default workflow if none exist
    if (resolved.responseWorkflows.length === 0) {
      let defaultBlock = resolved.responseBlocks.find(b => b.name === '200 OK');
      if (!defaultBlock) {
        defaultBlock = {
          id: randomUUID(),
          name: '200 OK',
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: '{}',
        };
        resolved.responseBlocks.push(defaultBlock);
      }
      resolved.responseWorkflows.push({
        id: randomUUID(),
        name: 'Default',
        steps: [{
          id: randomUUID(),
          order: 1,
          type: 'return_response',
          responseBlockId: defaultBlock.id,
        }],
      });
    }

    this.current = resolved;
    return this.current;
  }

  getCurrent(): Config | null { return this.current; }

  /**
   * Merge spec-discovered endpoints into the in-memory config for a service.
   * Existing endpoints (with statements/config) are preserved.
   * New endpoints from the spec are appended with empty statements.
   * Does NOT write to disk — runtime state only.
   */
  mergeSpecEndpoints(serviceId: string, parsedEndpoints: ParsedEndpoint[]): void {
    if (!this.current) return;
    const svc = this.current.services.find(s => s.id === serviceId);
    if (!svc) return;

    for (const ep of parsedEndpoints) {
      const exists = svc.endpoints.some(
        e => e.method === ep.method && e.path === ep.path,
      );
      if (!exists) {
        svc.endpoints.push({
          id: randomUUID(),
          method: ep.method,
          path: ep.path,
          statements: [],
        });
      }
    }
  }

  async write(config: Config): Promise<void> {
    if (!this.configPath) throw new Error('ConfigService not initialised — call load() first');
    this.validate(config);
    // Persist the literal ${VAR} placeholders to disk (portable, no secrets
    // committed) — but resolve them for the in-memory copy immediately, same
    // as load() does. Without this, every consumer of getCurrent() (module
    // connections, template rendering, etc.) would see unresolved literal
    // "${VAR}" strings until the config-file watcher's next reload catches up.
    const yaml = dump(config, { lineWidth: 120, noRefs: true });
    writeFileSync(this.configPath, yaml, 'utf8');
    this.current = this.resolveEnvVars(config) as Config;
  }

  private validate(config: Config): void {
    const ports = config.services.map(s => s.port);
    const dups = ports.filter((p, i) => ports.indexOf(p) !== i);
    if (dups.length) throw new Error(`Duplicate service ports: ${dups.join(', ')}`);
    for (const svc of config.services) {
      if (!svc.id) throw new Error(`Service "${svc.name}" is missing an id`);
      if (!svc.port || svc.port < 1 || svc.port > 65535)
        throw new Error(`Service "${svc.name}" has invalid port ${svc.port}`);
    }
    for (const mod of config.modules) {
      if (mod.type !== 'kafka') continue;
      const listeners = (mod.config as KafkaModuleConfig).listeners ?? [];
      const topics = listeners.map(l => l.topic);
      const topicDups = topics.filter((t, i) => topics.indexOf(t) !== i);
      if (topicDups.length)
        throw new Error(`Module "${mod.name}" has duplicate Kafka topics: ${topicDups.join(', ')}`);
    }
  }

  private resolveEnvVars(obj: unknown): unknown {
    if (typeof obj === 'string')
      return obj.replace(/\$\{([^}]+)\}/g, (_, k: string) => {
        const v = process.env[k];
        if (!v) this.logger.warn(`Unresolved env var: \${${k}}`);
        return v ?? '';
      });
    if (Array.isArray(obj)) return obj.map(v => this.resolveEnvVars(v));
    if (obj !== null && typeof obj === 'object')
      return Object.fromEntries(
        Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, this.resolveEnvVars(v)])
      );
    return obj;
  }
}
