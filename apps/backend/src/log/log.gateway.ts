import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import type { LogEntryDto } from '@mockingbird/shared-types';
import { LogService } from './log.service';

@WebSocketGateway({ path: '/ws/log', cors: { origin: '*' } })
export class LogGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly logService: LogService) {}

  handleConnection(client: Socket): void {
    // Send last 100 entries to new client
    client.emit('log:batch', this.logService.getLast(100));
  }

  broadcast(entry: LogEntryDto): void {
    this.server.emit('log', entry);
  }
}
