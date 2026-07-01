import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';
import { WorkflowExecutorService } from './workflow-executor.service';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';

@Module({
  imports: [ModuleRegistryModule],
  providers: [TemplateService, WorkflowExecutorService],
  exports: [TemplateService, WorkflowExecutorService],
})
export class WorkflowModule {}
