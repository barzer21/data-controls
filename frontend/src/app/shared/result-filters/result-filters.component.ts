import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BusinessValuePipe } from '../business-value.pipe';
import { operatorsForType } from '../../core/rules/comparison-operators';
import {
  ColumnFilter,
  emptySelection,
  FilterColumn,
  parseColumnFilter,
  ResultFilterSelection,
} from './result-filters.model';

@Component({
  selector: 'app-result-filters',
  imports: [FormsModule, BusinessValuePipe],
  templateUrl: './result-filters.component.html',
  styleUrl: './result-filters.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResultFiltersComponent {
  readonly columns = input.required<readonly FilterColumn[]>();
  readonly selection = input<ResultFilterSelection>(emptySelection());
  readonly selectionChange = output<ResultFilterSelection>();
  readonly searchDraft = signal('');
  readonly selectedColumnId = signal<string | null>(null);
  readonly operator = signal('equals');
  readonly value = signal('');
  readonly error = signal('');
  readonly column = computed(() =>
    this.columns().find((column) => column.id === this.selectedColumnId()),
  );
  readonly searchable = computed(() => this.columns().some((column) => column.type === 'text'));
  readonly operators = computed(() => operatorsForType(this.column()?.type));
  private readonly injector = inject(Injector);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  constructor() {
    effect(() => this.searchDraft.set(this.selection().search));
  }

  openColumn(id: string): void {
    const column = this.columns().find((column) => column.id === id);
    if (!column) return;
    const applied = this.selection().filters.find((filter) => filter.columnId === id);
    this.selectedColumnId.set(id);
    this.operator.set(applied?.operator ?? 'equals');
    this.value.set(
      applied?.value === undefined
        ? column.type === 'boolean'
          ? 'true'
          : ''
        : String(applied.value),
    );
    this.error.set('');
    afterNextRender(() => this.panel()?.nativeElement.focus(), { injector: this.injector });
  }

  applySearch(): void {
    this.emit({ ...this.selection(), search: this.searchDraft() });
  }

  applyColumn(): void {
    const column = this.column();
    if (!column) return;
    const parsed = parseColumnFilter(column, this.operator(), this.value());
    if ('error' in parsed) {
      this.error.set(parsed.error);
      return;
    }
    const filters = this.selection().filters.filter((filter) => filter.columnId !== column.id);
    this.emit({ search: this.searchDraft(), filters: [...filters, parsed.filter] });
    if (!this.error()) this.selectedColumnId.set(null);
  }

  removeColumn(columnId: string): void {
    this.selectedColumnId.set(null);
    this.emit({
      ...this.selection(),
      filters: this.selection().filters.filter((filter) => filter.columnId !== columnId),
    });
  }

  clear(): void {
    this.searchDraft.set('');
    this.selectedColumnId.set(null);
    this.emit(emptySelection());
  }

  removeSearch(): void {
    this.emit({ ...this.selection(), search: '' });
  }
  columnLabel(id: string): string {
    return this.columns().find((column) => column.id === id)?.label ?? 'עמודה שאינה זמינה';
  }
  columnType(id: string): string | undefined {
    return this.columns().find((column) => column.id === id)?.type;
  }
  operatorLabel(filter: ColumnFilter): string {
    return (
      operatorsForType(this.columnType(filter.columnId)).find(
        (operator) => operator.id === filter.operator,
      )?.label ?? 'השוואה'
    );
  }

  private emit(selection: ResultFilterSelection): void {
    if (selection.search.length > 200) {
      this.error.set('טקסט החיפוש מוגבל ל־200 תווים.');
      return;
    }
    if (selection.filters.length > 99) {
      this.error.set('ניתן להפעיל עד 99 מסנני עמודות יחד.');
      return;
    }
    this.error.set('');
    this.selectionChange.emit(selection);
  }
}
