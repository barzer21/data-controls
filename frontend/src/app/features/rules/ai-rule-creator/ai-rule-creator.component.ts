import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { apiErrorMessages } from '../../../core/api/api-error-messages';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AiProposalsApiService } from '../../../core/api/ai-proposals-api.service';
import { RuleDefinition } from '../../../core/api/api.models';

@Component({
  selector: 'app-ai-rule-creator',
  imports: [FormsModule],
  templateUrl: './ai-rule-creator.component.html',
  styleUrl: './ai-rule-creator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiRuleCreatorComponent {
  readonly closed = output<void>();
  readonly closeCancelled = output<void>();
  readonly proposed = output<RuleDefinition>();
  readonly description = signal('');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly confirmClose = signal(false);
  readonly examples = signal<readonly string[]>([]);
  readonly examplesError = signal(false);

  private readonly api = inject(AiProposalsApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly keepWritingButton =
    viewChild<ElementRef<HTMLButtonElement>>('keepWritingButton');

  constructor() {
    this.loadExamples();
  }

  loadExamples(): void {
    this.examplesError.set(false);
    this.api
      .examples()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (examples) => this.examples.set(examples),
        error: () => this.examplesError.set(true),
      });
  }

  updateDescription(value: string): void {
    this.description.set(value);
    this.error.set('');
    this.confirmClose.set(false);
  }

  requestClose(): void {
    if (this.busy() || !this.description().trim()) this.close();
    else {
      this.confirmClose.set(true);
      afterNextRender(() => this.keepWritingButton()?.nativeElement.focus(), {
        injector: this.injector,
      });
    }
  }

  cancelClose(): void {
    this.confirmClose.set(false);
    this.closeCancelled.emit();
    afterNextRender(() => this.closeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  onEscape(event: Event): void {
    event.preventDefault();
    if (this.confirmClose()) this.cancelClose();
    else this.requestClose();
  }

  close(): void {
    this.closed.emit();
  }

  generate(): void {
    if (this.busy()) return;
    const description = this.description().trim();
    if (!description || description.length > 2000) {
      this.error.set('יש להזין תיאור באורך של עד 2,000 תווים.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.confirmClose.set(false);
    this.api
      .propose(description)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(false)),
      )
      .subscribe({
        next: (proposal) => this.proposed.emit(proposal),
        error: (error: unknown) => {
          const messages: Record<number, string> = {
            400: 'התיאור אינו נתמך בהדגמה. בחרו אחת מהדוגמאות ונסו שוב.',
            502: 'התקבלה הצעה לא תקינה. אפשר לנסות שוב; לא נשמרה או הורצה בקרה.',
            503: 'שירות יצירת ההצעות אינו זמין כרגע. נסו שוב לאחר הפעלת השירות.',
            504: 'יצירת ההצעה חרגה מזמן ההמתנה. אפשר לנסות שוב.',
          };
          this.error.set(
            apiErrorMessages(error, {
              statusMessages: messages,
              fallback: 'לא ניתן ליצור הצעה כרגע. בדקו את החיבור ונסו שוב.',
            }).join(' '),
          );
        },
      });
  }
}
