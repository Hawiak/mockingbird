import { Module } from '@nestjs/common';
import { LogService } from './log.service';
import { LogGateway } from './log.gateway';

@Module({
  providers: [LogService, LogGateway],
  exports: [LogService, LogGateway],
})
export class LogModule {}
