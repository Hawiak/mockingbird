import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ModuleRegistryModule, ConfigModule],
  providers: [TemplateService, WorkflowExecutorService],
  exports: [TemplateService, WorkflowExecutorService],
})
export class WorkflowModule {}
