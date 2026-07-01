import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type SaveStatus = 'saved' | 'unsaved' | 'saving' | 'error';

@Injectable({ providedIn: 'root' })
export class SaveStateService {
  readonly status$ = new BehaviorSubject<SaveStatus>('saved');
  readonly errorMessage$ = new BehaviorSubject<string>('');

  markUnsaved(): void { this.status$.next('unsaved'); }

  async save(fn: () => Promise<void>): Promise<void> {
    this.status$.next('saving');
    try {
      await fn();
      this.status$.next('saved');
      this.errorMessage$.next('');
    } catch (e: unknown) {
      this.status$.next('error');
      this.errorMessage$.next((e as Error).message);
      throw e;
    }
  }
}
