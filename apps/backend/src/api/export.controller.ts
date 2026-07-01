import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { randomUUID } from 'crypto';
import { ConfigService } from '../config/config.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const JSZip = require('jszip');

@Controller('export')
export class ExportController {
  constructor(private readonly configService: ConfigService) {}

  @Get('postman')
  getPostman(@Res() res: Response): void {
    const config = this.configService.getCurrent();
    const services = config?.services ?? [];

    const items = services.map((service) => {
      const endpointItems = (service.endpoints ?? []).map((endpoint) => {
        const pathSegments = endpoint.path.split('/').filter((s) => s !== '');
        const pathVariables = pathSegments
          .filter((s) => s.startsWith(':'))
          .map((s) => ({ key: s.slice(1), value: '1' }));

        return {
          name: `${endpoint.method.toUpperCase()} ${endpoint.path}`,
          request: {
            method: endpoint.method.toUpperCase(),
            header: [],
            url: {
              raw: `http://localhost:${service.port}${endpoint.path}`,
              protocol: 'http',
              host: ['localhost'],
              port: String(service.port),
              path: pathSegments,
              variable: pathVariables,
            },
          },
          response: [],
        };
      });

      return {
        name: `${service.name} (localhost:${service.port})`,
        item: endpointItems,
      };
    });

    const collection = {
      info: {
        _postman_id: randomUUID(),
        name: 'Mockingbird',
        description: 'Exported from Mockingbird',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      item: items,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="mockingbird-postman.json"');
    res.send(JSON.stringify(collection, null, 2));
  }

  @Get('bruno')
  async getBruno(@Res() res: Response): Promise<void> {
    const config = this.configService.getCurrent();
    const services = config?.services ?? [];

    const zip = new JSZip();
    const root = zip.folder('mockingbird');

    root.file('bruno.json', JSON.stringify({ version: '1', name: 'Mockingbird', type: 'collection' }, null, 2));

    for (const service of services) {
      const folder = root.folder(service.name);
      folder.file('bruno.json', JSON.stringify({ version: '1', name: service.name, type: 'folder' }, null, 2));

      const endpoints = service.endpoints ?? [];
      for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        const method = endpoint.method.toLowerCase();
        const pathSegments = endpoint.path.split('/').filter((s) => s !== '');
        const pathVariables = pathSegments.filter((s) => s.startsWith(':'));

        let bruContent = `meta {\n`;
        bruContent += `  name: ${endpoint.method.toUpperCase()} ${endpoint.path}\n`;
        bruContent += `  type: http\n`;
        bruContent += `  seq: ${i + 1}\n`;
        bruContent += `}\n\n`;

        bruContent += `${method} {\n`;
        bruContent += `  url: http://localhost:${service.port}${endpoint.path}\n`;
        bruContent += `  body: none\n`;
        bruContent += `  auth: none\n`;
        bruContent += `}\n`;

        if (pathVariables.length > 0) {
          bruContent += `\nparams:path {\n`;
          for (const pv of pathVariables) {
            bruContent += `  ${pv.slice(1)}: 1\n`;
          }
          bruContent += `}\n`;
        }

        const rawName = `${endpoint.method.toUpperCase()}_${endpoint.path}`;
        const sanitized = rawName.replace(/[/:]/g, '_').replace(/^_+/, '').slice(0, 60);
        const fileName = `${sanitized}.bru`;

        folder.file(fileName, bruContent);
      }
    }

    const buffer: Buffer = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="mockingbird-bruno.zip"');
    res.send(buffer);
  }
}
