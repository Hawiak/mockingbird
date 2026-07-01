import { Module } from '@nestjs/common';
import { ModuleRegistryService } from './module-registry.service';

@Module({
  providers: [ModuleRegistryService],
  exports: [ModuleRegistryService],
})
export class ModuleRegistryModule {}
