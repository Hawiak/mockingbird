import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { SwaggerModule } from '../swagger/swagger.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { KafkaListenerModule } from '../kafka-listener/kafka-listener.module';
import { MockModule } from '../mock/mock.module';
import { LogModule } from '../log/log.module';
import { SpecDriftService } from '../swagger/spec-drift.service';
import { ServicesController } from './services.controller';
import { EndpointsController } from './endpoints.controller';
import { StatementsController } from './statements.controller';
import { ResponseBlocksController } from './response-blocks.controller';
import { ModulesController } from './modules.controller';
import { ParameterSetsController } from './parameter-sets.controller';
import { LogController } from './log.controller';
import { TemplateController } from './template.controller';
import { HealthController } from './health.controller';
import { ExportController } from './export.controller';
import { ResponseWorkflowsController } from './response-workflows.controller';
import { SavedConditionsController } from './saved-conditions.controller';

@Module({
  imports: [
    ConfigModule,
    SwaggerModule,
    WorkflowModule,
    ModuleRegistryModule,
    KafkaListenerModule,
    MockModule,
    LogModule,
  ],
  providers: [SpecDriftService],
  controllers: [
    ServicesController,
    EndpointsController,
    StatementsController,
    ResponseBlocksController,
    ModulesController,
    ParameterSetsController,
    LogController,
    TemplateController,
    HealthController,
    ExportController,
    ResponseWorkflowsController,
    SavedConditionsController,
  ],
})
export class ApiModule {}
