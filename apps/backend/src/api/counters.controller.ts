import { Controller, Get, Post, Param } from '@nestjs/common';
import type { CounterDto } from '@mockingbird/shared-types';
import { StateStoreService } from '../data-store/state-store.service';

/**
 * Counters backing the {{autoIncrement "key"}} template helper — named, persistent,
 * in-memory integer sequences independent of any data store. See docs/templates.md.
 */
@Controller('counters')
export class CountersController {
  constructor(private readonly stateStoreService: StateStoreService) {}

  @Get()
  getAll(): CounterDto[] {
    return Object.entries(this.stateStoreService.listAutoIncrements()).map(([key, value]) => ({ key, value }));
  }

  @Post(':key/reset')
  reset(@Param('key') key: string): void {
    this.stateStoreService.resetAutoIncrement(key);
  }
}
