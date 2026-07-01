import { Module } from '@nestjs/common';
import { ConditionService } from './condition.service';
import { StatementMatcherService } from './statement-matcher.service';

@Module({
  providers: [ConditionService, StatementMatcherService],
  exports: [ConditionService, StatementMatcherService],
})
export class StatementModule {}
