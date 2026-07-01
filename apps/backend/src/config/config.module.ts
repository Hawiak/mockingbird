import { Module } from '@nestjs/common';
import { ConfigService } from './config.service';
import { ConfigWatcherService } from './config-watcher.service';

@Module({
  providers: [ConfigService, ConfigWatcherService],
  exports: [ConfigService, ConfigWatcherService],
})
export class ConfigModule {}
