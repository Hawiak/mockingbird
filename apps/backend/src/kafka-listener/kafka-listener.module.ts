import { Module } from '@nestjs/common';
import { KafkaListenerService } from './kafka-listener.service';
import { ConfigModule } from '../config/config.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { StatementModule } from '../statement/statement.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { LogModule } from '../log/log.module';

@Module({
  imports: [ConfigModule, ModuleRegistryModule, StatementModule, WorkflowModule, LogModule],
  providers: [KafkaListenerService],
  exports: [KafkaListenerService],
})
export class KafkaListenerModule {}
