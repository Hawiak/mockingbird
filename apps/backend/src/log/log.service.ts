import { Injectable } from '@nestjs/common';
import type { LogEntryDto } from '@mockingbird/shared-types';

const DEFAULT_CAPACITY = 1000;
const MAX_CAPACITY = 10_000;

@Injectable()
export class LogService {
  private readonly buffer: LogEntryDto[] = [];
  private readonly capacity = DEFAULT_CAPACITY;

  add(entry: LogEntryDto): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.capacity) {
      this.buffer.shift();
    }
  }

  getAll(): LogEntryDto[] {
    return [...this.buffer];
  }

  getLast(n: number): LogEntryDto[] {
    return this.buffer.slice(-n);
  }
}
