import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { Endpoint, ParsedSpec, OrphanedEndpointDto } from '@mockingbird/shared-types';
import { ConfigService } from '../config/config.service';
import { SpecChangedEvent } from './swagger-loader.service';

@Injectable()
export class SpecDriftService {
  private readonly orphaned = new Map<string, OrphanedEndpointDto[]>();

  constructor(private readonly configService: ConfigService) {}

  @OnEvent('spec.changed')
  onSpecChanged(event: SpecChangedEvent): void {
    const config = this.configService.getCurrent();
    if (!config) return;
    const service = config.services.find(s => s.id === event.serviceId);
    const oldEndpoints = service?.endpoints ?? [];
    this.handleSpecChanged(event.serviceId, oldEndpoints, event.spec);
    // Merge any new endpoints discovered in the refreshed spec
    this.configService.mergeSpecEndpoints(event.serviceId, event.spec.endpoints);
  }

  handleSpecChanged(serviceId: string, oldEndpoints: Endpoint[], newSpec: ParsedSpec): void {
    const newPaths = new Set(newSpec.endpoints.map(e => `${e.method}:${e.path}`));
    const orphans: OrphanedEndpointDto[] = oldEndpoints
      .filter(e => !newPaths.has(`${e.method}:${e.path}`))
      .filter(e => (e.statements?.length ?? 0) > 0 || !!e.defaultResponseBlockId)
      .map(e => ({
        method: e.method,
        path: e.path,
        serviceId,
        statementCount: e.statements?.length ?? 0,
      }));
    this.orphaned.set(serviceId, orphans);
  }

  getOrphaned(serviceId: string): OrphanedEndpointDto[] {
    return this.orphaned.get(serviceId) ?? [];
  }

  clearOrphan(serviceId: string, method: string, path: string): void {
    const current = this.orphaned.get(serviceId) ?? [];
    this.orphaned.set(
      serviceId,
      current.filter(o => !(o.method === method && o.path === path)),
    );
  }
}
