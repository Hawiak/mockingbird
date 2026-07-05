import { Controller, Get, Query } from '@nestjs/common';
import type { LogEntryDto } from '@mockingbird/shared-types';
import { LogService } from '../log/log.service';

@Controller('log')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get()
  getLogs(
    @Query('serviceId') serviceId?: string,
    @Query('method') method?: string,
    @Query('statusRange') statusRange?: string,
    @Query('path') path?: string,
  ): LogEntryDto[] {
    let entries = this.logService.getAll();

    if (serviceId) {
      entries = entries.filter(e => e.serviceId === serviceId);
    }
    if (method) {
      entries = entries.filter(e => e.method.toUpperCase() === method.toUpperCase());
    }
    if (path) {
      entries = entries.filter(e => e.path.includes(path));
    }
    if (statusRange) {
      const prefix = parseInt(statusRange[0], 10);
      if (!isNaN(prefix)) {
        entries = entries.filter(e => Math.floor(e.statusCode / 100) === prefix);
      }
    }

    return entries;
  }
}
