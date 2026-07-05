import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '../config/config.module';
import { SwaggerModule } from '../swagger/swagger.module';
import { MockModule } from '../mock/mock.module';
import { LogModule } from '../log/log.module';
import { StatementModule } from '../statement/statement.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { ModuleRegistryModule } from '../module-registry/module-registry.module';
import { KafkaListenerModule } from '../kafka-listener/kafka-listener.module';
import { ApiModule } from '../api/api.module';
import { DataStoreModule } from '../data-store/data-store.module';

@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, 'public'),
      exclude: ['/api/{*path}'],
    }),
    ConfigModule,
    SwaggerModule,
    MockModule,
    LogModule,
    StatementModule,
    WorkflowModule,
    ModuleRegistryModule,
    KafkaListenerModule,
    DataStoreModule,
    ApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
