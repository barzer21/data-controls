import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
} from '@angular/core';
import { MetadataEntity, RuleSummary } from '../../../core/api/api.models';

@Component({
  selector: 'app-saved-rules-list',
  templateUrl: './saved-rules-list.component.html',
  styleUrl: './saved-rules-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavedRulesListComponent {
  readonly rules = input.required<readonly RuleSummary[]>();
  readonly entities = input.required<readonly MetadataEntity[]>();
  readonly startIndex = input(0);
  readonly runRule = output<number>();
  readonly editRule = output<number>();
  readonly deleteRule = output<number>();
  readonly deleteConfirmed = output<number>();
  readonly deleteCancelled = output<void>();
  readonly pendingDeleteId = input<number | null>(null);
  readonly deletingId = input<number | null>(null);
  readonly deleteError = input('');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  constructor() {
    effect(() => {
      const id = this.pendingDeleteId();
      if (id !== null) this.focus(`[data-cancel-delete="${id}"]`);
    });
  }

  cancelDelete(id: number, event?: Event): void {
    if (this.deletingId() !== null) return;
    event?.stopPropagation();
    this.deleteCancelled.emit();
    this.focus(`[data-delete-rule="${id}"]`);
  }

  private focus(selector: string): void {
    afterNextRender(
      () => this.element.nativeElement.querySelector<HTMLButtonElement>(selector)?.focus(),
      { injector: this.injector },
    );
  }

  entityLabel(id: string): string {
    return (
      this.entities().find((entity) => entity.id.toLowerCase() === id.toLowerCase())?.label ??
      'סוג נתונים לא זמין'
    );
  }
}
