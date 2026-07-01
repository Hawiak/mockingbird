import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { App } from './app';
import { LogSocketService } from './core/log-socket.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        {
          provide: LogSocketService,
          useValue: {
            entries$: new BehaviorSubject([]),
            connect: () => undefined,
            clear: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should render the brand name', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand-name')?.textContent).toContain(
      'Mockingbird'
    );
  });
});
