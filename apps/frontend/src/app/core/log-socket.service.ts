import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import type { LogEntryDto } from '@mockingbird/shared-types';

@Injectable({ providedIn: 'root' })
export class LogSocketService implements OnDestroy {
  readonly entries$ = new BehaviorSubject<LogEntryDto[]>([]);
  private socket: Socket | null = null;

  connect(): void {
    if (this.socket) return;
    this.socket = io({ path: '/ws/log', transports: ['websocket'] });
    this.socket.on('log:batch', (entries: LogEntryDto[]) => {
      this.entries$.next([...this.entries$.value, ...entries].slice(-1000));
    });
    this.socket.on('log', (entry: LogEntryDto) => {
      this.entries$.next([...this.entries$.value, entry].slice(-1000));
    });
  }

  clear(): void { this.entries$.next([]); }

  ngOnDestroy(): void { this.socket?.disconnect(); }
}
