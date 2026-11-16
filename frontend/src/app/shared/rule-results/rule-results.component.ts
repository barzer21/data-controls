import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  OnChanges,
  signal,
} from '@angular/core';
import { apiErrorMessages } from '../../core/api/api-error-messages';
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
  selector: 'app-rule-results',
  imports: [ExecutionResultsComponent, ResultFiltersComponent],
  templateUrl: './rule-results.component.html',
  styleUrl: './rule-results.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleResultsComponent implements OnChanges {
  readonly definition = input.required<RuleDefinition>();
  readonly initialResult = input<RuleExecutionResponse>();
  readonly metadata = input.required<MetadataResponse>();
  private readonly api = inject(RulesApiService);
  private readonly requests = new Subject<ResultFilterSelection | null>();
  private readonly snapshot = signal<RuleDefinition | null>(null);
  private readonly columns = signal<readonly RuleResultColumn[]>([]);
  private readonly currentState = signal<ResultsState>({ status: 'running' });
  private readonly currentSelection = signal<ResultFilterSelection>(emptySelection());
  readonly state = this.currentState.asReadonly();
  readonly selection = this.currentSelection.asReadonly();
  readonly filterColumns = computed(() => {
    const definition = this.snapshot();
    return definition
      ? filterColumns(this.columns(), this.metadata(), definition.rootEntityId)
      : [];
  });
  readonly filterableColumnIds = computed(() => this.filterColumns().map((column) => column.id));
  readonly filteredColumnIds = computed(() =>
    this.selection().filters.map((filter) => filter.columnId),
  );
  readonly filtered = computed(
    () => !!this.selection().search.trim() || this.selection().filters.length > 0,
  );

  constructor() {
    this.requests
      .pipe(
        switchMap((selection) => (selection === null ? EMPTY : this.execute(selection))),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.currentState.set(state));
  }

  ngOnChanges(): void {
    // Each new definition/result cancels old work and starts with no active filters.
    this.requests.next(null);
    this.snapshot.set(structuredClone(this.definition()));
    this.columns.set([]);
    this.currentSelection.set(emptySelection());
    this.currentState.set({ status: 'running' });
    const initial = this.initialResult();
    if (initial) {
      this.columns.set(initial.columns);
      this.currentState.set({ status: 'ready', result: initial });
    } else this.retry();
  }

  applyFilters(selection: ResultFilterSelection): void {
    this.currentSelection.set(structuredClone(selection));
    this.retry();
  }

  retry(): void {
    if (this.snapshot()) this.requests.next(this.selection());
  }

  private execute(selection: ResultFilterSelection) {
    try {
      const options = executionOptions(selection, this.filterColumns());
      return this.api.execute(this.snapshot()!, options).pipe(
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
        message: error instanceof Error ? error.message : this.errorMessage(error),
      });
    }
  }

  private errorMessage(error: unknown): string {
    return apiErrorMessages(error, {
      fallback: 'לא ניתן לעדכן את תוצאות ההרצה. בדקו את החיבור ונסו שוב.',
      statusMessages: { 504: 'ההרצה חרגה מזמן ההמתנה. ניתן לנסות שוב.' },
      useProblemTitle: true,
    }).join(' ');
  }
}
