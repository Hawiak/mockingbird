import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SwaggerLoaderService } from './swagger-loader.service';
import { ResponseGeneratorService } from './response-generator.service';

@Module({
  imports: [EventEmitterModule.forRoot({ global: true })],
  providers: [SwaggerLoaderService, ResponseGeneratorService],
  exports: [SwaggerLoaderService, ResponseGeneratorService],
})
export class SwaggerModule {}
