import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { watch, FSWatcher } from 'chokidar';
import { createHash } from 'crypto';
import { Subject, Observable } from 'rxjs';
import type { Config } from '@mockingbird/shared-types';
import { ConfigService } from './config.service';

@Injectable()
export class ConfigWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConfigWatcherService.name);
  private watcher: FSWatcher | null = null;
  private currentHash = '';
  private readonly changes$ = new Subject<{ old: Config; new: Config }>();

  constructor(private readonly configService: ConfigService) {}

  get changes(): Observable<{ old: Config; new: Config }> {
    return this.changes$.asObservable();
  }

  onModuleInit(): void {
    const path = process.env.CONFIG_PATH ?? 'mockingbird.yaml';
    this.watcher = watch(path, { persistent: true, ignoreInitial: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    this.watcher.on('change', () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.handleChange(path), 200);
    });
  }

  onModuleDestroy(): void {
    this.watcher?.close();
  }

  private async handleChange(path: string): Promise<void> {
    try {
      const old = this.configService.getCurrent();
      const updated = await this.configService.load(path);
      const hash = createHash('sha256').update(JSON.stringify(updated)).digest('hex');
      if (hash === this.currentHash) return;
      this.currentHash = hash;
      this.logger.log('Config reloaded');
      if (old) this.changes$.next({ old, new: updated });
    } catch (e: unknown) {
      this.logger.error(`Config reload failed: ${(e as Error).message}`);
    }
  }
}
