import { Module } from '@nestjs/common';
import { MockServerService } from './mock-server.service';
import { ConfigModule } from '../config/config.module';
import { StatementModule } from '../statement/statement.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LogModule } from '../log/log.module';

@Module({
  imports: [ConfigModule, StatementModule, WorkflowModule, LogModule],
  providers: [MockServerService],
  exports: [MockServerService],
})
export class MockModule {}
