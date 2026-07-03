import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ConfigService } from './config.service';
import type { Config } from '@mockingbird/shared-types';

function tmpFile(name: string): string {
  const dir = join(tmpdir(), 'mockingbird-test');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

const MINIMAL_CONFIG: Config = {
  version: '1',
  settings: { uiPort: 9000 },
  responseBlocks: [],
  services: [
    {
      id: 'svc1',
      name: 'Service One',
      port: 8081,
      spec: { type: 'url', url: 'http://example.com/spec.json' },
      endpoints: [],
    },
  ],
  modules: [],
  parameterSets: [],
};

function makeYaml(config: Config): string {
  // Simple YAML serialisation using js-yaml (same lib as ConfigService)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { dump } = require('js-yaml') as { dump: (o: unknown) => string };
  return dump(config);
}

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();
    service = module.get<ConfigService>(ConfigService);
  });

  describe('load()', () => {
    it('parses a valid YAML config file', async () => {
      const path = tmpFile('valid.yaml');
      writeFileSync(path, makeYaml(MINIMAL_CONFIG), 'utf8');

      const config = await service.load(path);

      expect(config.version).toBe('1');
      expect(config.services[0].port).toBe(8081);
      expect(config.services[0].id).toBe('svc1');
    });

    it('resolves ${ENV_VAR} substitution', async () => {
      process.env['TEST_TOKEN'] = 'secret-abc';
      const path = tmpFile('env-vars.yaml');
      const raw = `
version: '1'
settings:
  uiPort: 9000
responseBlocks: []
services:
  - id: svc1
    name: Service One
    port: 8081
    spec:
      type: url
      url: 'http://example.com'
      headers:
        Authorization: 'Bearer \${TEST_TOKEN}'
    endpoints: []
modules: []
parameterSets: []
`;
      writeFileSync(path, raw, 'utf8');

      const config = await service.load(path);

      expect(config.services[0].spec.headers?.['Authorization']).toBe('Bearer secret-abc');
      delete process.env['TEST_TOKEN'];
    });

    it('replaces missing env var with empty string and warns (no throw)', async () => {
      delete process.env['MISSING_VAR'];
      const path = tmpFile('missing-env.yaml');
      const raw = `
version: '1'
settings:
  uiPort: 9000
responseBlocks: []
services:
  - id: svc1
    name: Service One
    port: 8081
    spec:
      type: url
      url: 'http://\${MISSING_VAR}/spec.json'
    endpoints: []
modules: []
parameterSets: []
`;
      writeFileSync(path, raw, 'utf8');

      // Should not throw
      const config = await service.load(path);
      expect(config.services[0].spec.url).toBe('http:///spec.json');
    });

    it('returns a valid empty config for an empty file (does not throw)', async () => {
      const path = tmpFile('empty.yaml');
      writeFileSync(path, '', 'utf8');

      const config = await service.load(path);

      expect(config.services).toEqual([]);
      expect(config.modules).toEqual([]);
    });

    it('defaults services to [] when absent from YAML (does not throw)', async () => {
      const path = tmpFile('no-services.yaml');
      const raw = `
version: '1'
settings:
  uiPort: 9000
modules: []
parameterSets: []
`;
      writeFileSync(path, raw, 'utf8');

      const config = await service.load(path);

      expect(config.services).toEqual([]);
    });
  });

  describe('write()', () => {
    it('creates a .tmp file then renames to final path', async () => {
      const path = tmpFile('write-test.yaml');
      writeFileSync(path, makeYaml(MINIMAL_CONFIG), 'utf8');
      await service.load(path);

      await service.write(MINIMAL_CONFIG);

      // After write: the final file exists and the .tmp file does not
      expect(existsSync(path)).toBe(true);
      expect(existsSync(`${path}.tmp`)).toBe(false);
    });

    it('resolves ${ENV_VAR} placeholders in the in-memory config immediately, without waiting for a reload', async () => {
      process.env['TEST_WRITE_SECRET'] = 'resolved-value';
      const path = tmpFile('write-env-var.yaml');
      writeFileSync(path, makeYaml(MINIMAL_CONFIG), 'utf8');
      await service.load(path);

      const withPlaceholder: Config = {
        ...MINIMAL_CONFIG,
        modules: [
          {
            id: 'kafka1', name: 'Kafka', type: 'kafka',
            config: { brokers: ['kafka:9092'], sasl: { mechanism: 'PLAIN', username: '${TEST_WRITE_SECRET}', password: 'x' } },
          },
        ],
      };
      await service.write(withPlaceholder);

      // The file on disk keeps the literal placeholder (portable, no secrets committed)...
      const onDisk = readFileSync(path, 'utf8');
      expect(onDisk).toContain('${TEST_WRITE_SECRET}');

      // ...but the in-memory copy everything else reads must already be resolved.
      const current = service.getCurrent();
      const sasl = (current?.modules[0].config as { sasl?: { username?: string } }).sasl;
      expect(sasl?.username).toBe('resolved-value');

      delete process.env['TEST_WRITE_SECRET'];
    });

    it('throws on duplicate service ports', async () => {
      const path = tmpFile('dup-ports.yaml');
      writeFileSync(path, makeYaml(MINIMAL_CONFIG), 'utf8');
      await service.load(path);

      const dupConfig: Config = {
        ...MINIMAL_CONFIG,
        services: [
          { id: 'svc1', name: 'A', port: 8081, spec: { type: 'url' }, endpoints: [] },
          { id: 'svc2', name: 'B', port: 8081, spec: { type: 'url' }, endpoints: [] },
        ],
      };

      await expect(service.write(dupConfig)).rejects.toThrow(/Duplicate service ports/);
    });

    it('throws when service is missing id', async () => {
      const path = tmpFile('no-id.yaml');
      writeFileSync(path, makeYaml(MINIMAL_CONFIG), 'utf8');
      await service.load(path);

      const noIdConfig: Config = {
        ...MINIMAL_CONFIG,
        services: [
          { id: '', name: 'A', port: 8081, spec: { type: 'url' }, endpoints: [] },
        ],
      };

      await expect(service.write(noIdConfig)).rejects.toThrow(/missing an id/);
    });

    it('throws when service has invalid port', async () => {
      const path = tmpFile('bad-port.yaml');
      writeFileSync(path, makeYaml(MINIMAL_CONFIG), 'utf8');
      await service.load(path);

      const badPortConfig: Config = {
        ...MINIMAL_CONFIG,
        services: [
          { id: 'svc1', name: 'A', port: 99999, spec: { type: 'url' }, endpoints: [] },
        ],
      };

      await expect(service.write(badPortConfig)).rejects.toThrow(/invalid port/);
    });

    it('throws if called before load()', async () => {
      await expect(service.write(MINIMAL_CONFIG)).rejects.toThrow(/not initialised/);
    });

    afterAll(() => {
      // Clean up tmp files
      const dir = join(tmpdir(), 'mockingbird-test');
      const files = ['valid.yaml', 'env-vars.yaml', 'missing-env.yaml', 'empty.yaml',
        'no-services.yaml', 'write-test.yaml', 'write-env-var.yaml', 'dup-ports.yaml', 'no-id.yaml', 'bad-port.yaml'];
      for (const f of files) {
        const p = join(dir, f);
        if (existsSync(p)) try { unlinkSync(p); } catch { /* ignore */ }
      }
    });
  });
});
