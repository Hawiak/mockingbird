import { Module } from '@nestjs/common';
import { StateStoreService } from './state-store.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [StateStoreService],
  exports: [StateStoreService],
})
export class DataStoreModule {}
