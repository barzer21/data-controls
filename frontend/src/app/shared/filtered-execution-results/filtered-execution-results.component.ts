import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnChanges,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, EMPTY, map, of, startWith, Subject, switchMap } from 'rxjs';
import {
  MetadataResponse,
  RuleDefinition,
  RuleExecutionResponse,
  RuleResultColumn,
} from '../../core/api/api.models';
import { RulesApiService } from '../../core/api/rules-api.service';
import { ExecutionResultsComponent } from '../execution-results/execution-results.component';
import { ResultFiltersComponent } from '../result-filters/result-filters.component';
import {
  emptySelection,
  executionOptions,
  filterColumns,
  ResultFilterSelection,
} from '../result-filters/result-filters.model';

type ResultsState =
  | { status: 'running' }
  | { status: 'ready'; result: RuleExecutionResponse }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-filtered-execution-results',
  imports: [ExecutionResultsComponent, ResultFiltersComponent],
  templateUrl: './filtered-execution-results.component.html',
  styleUrl: './filtered-execution-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilteredExecutionResultsComponent implements OnChanges {
  readonly definition = input.required<RuleDefinition>();
  readonly initialResult = input.required<RuleExecutionResponse>();
  readonly metadata = input.required<MetadataResponse>();
  readonly selection = signal<ResultFilterSelection>(emptySelection());
  readonly state = signal<ResultsState>({ status: 'running' });
  private readonly columns = signal<readonly RuleResultColumn[]>([]);
  readonly filterColumns = computed(() =>
    filterColumns(this.columns(), this.metadata(), this.definition().rootEntityId),
  );
  readonly filterableColumnIds = computed(() => this.filterColumns().map((column) => column.id));
  readonly filteredColumnIds = computed(() =>
    this.selection().filters.map((filter) => filter.columnId),
  );
  readonly filtered = computed(
    () => !!this.selection().search.trim() || this.selection().filters.length > 0,
  );
  private readonly api = inject(RulesApiService);
  private readonly requests = new Subject<ResultFilterSelection | null>();
  private snapshot: RuleDefinition | null = null;

  constructor() {
    this.requests
      .pipe(
        switchMap((selection) => (selection === null ? EMPTY : this.execute(selection))),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  ngOnChanges(): void {
    this.requests.next(null);
    this.snapshot = structuredClone(this.definition());
    this.columns.set(this.initialResult().columns);
    this.selection.set(emptySelection());
    this.state.set({ status: 'ready', result: this.initialResult() });
  }

  applyFilters(selection: ResultFilterSelection): void {
    const copy = structuredClone(selection);
    this.selection.set(copy);
    this.requests.next(copy);
  }

  retry(): void {
    this.requests.next(this.selection());
  }

  private execute(selection: ResultFilterSelection) {
    try {
      const options = executionOptions(selection, this.filterColumns());
      return this.api.execute(this.snapshot!, options).pipe(
        map((result): ResultsState => {
          this.columns.set(result.columns);
          return { status: 'ready', result };
        }),
        catchError((error) =>
          of<ResultsState>({ status: 'error', message: this.errorMessage(error) }),
        ),
        startWith<ResultsState>({ status: 'running' }),
      );
    } catch (error) {
      return of<ResultsState>({
        status: 'error',
        message: error instanceof Error ? error.message : 'לא ניתן להפעיל את הסינון.',
      });
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 400 && Array.isArray(error.error?.errors)) {
        const messages = error.error.errors
          .filter((item: { message?: unknown }) => typeof item?.message === 'string')
          .map((item: { message: string }) => item.message);
        if (messages.length) return messages.join(' ');
      }
      if (error.status === 504) return 'ההרצה חרגה מזמן ההמתנה. ניתן לנסות שוב.';
    }
    return 'לא ניתן לעדכן את תוצאות ההרצה. בדקו את החיבור ונסו שוב.';
  }
}
