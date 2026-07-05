import { Module } from '@nestjs/common';
import { ConditionService } from './condition.service';
import { DataStoreModule } from '../data-store/data-store.module';

@Module({
  imports: [DataStoreModule],
  providers: [ConditionService],
  exports: [ConditionService],
})
export class StatementModule {}
