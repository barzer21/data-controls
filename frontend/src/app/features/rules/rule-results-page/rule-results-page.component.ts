import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, combineLatest, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import {
  MetadataResponse,
  RuleExecutionResponse,
  SavedRuleResponse,
} from '../../../core/api/api.models';
import { RulesApiService } from '../../../core/api/rules-api.service';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RuleConditionComponent } from '../../../shared/rule-condition/rule-condition.component';
import { ExecutionResultsComponent } from '../../../shared/execution-results/execution-results.component';

interface Snapshot {
  saved: SavedRuleResponse;
  metadata: MetadataResponse;
}
type ResultsState =
  | { status: 'loading' }
  | { status: 'loadError'; message: string }
  | (Snapshot & { status: 'running' })
  | (Snapshot & { status: 'executionError'; message: string })
  | (Snapshot & { status: 'ready'; result: RuleExecutionResponse });

@Component({
  selector: 'app-rule-results-page',
  imports: [RouterLink, RuleConditionComponent, ExecutionResultsComponent],
  templateUrl: './rule-results-page.component.html',
  styleUrl: './rule-results-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleResultsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly rules = inject(RulesApiService);
  private readonly metadata = inject(MetadataApiService);
  private readonly retryRequests = new Subject<void>();
  readonly state = signal<ResultsState>({ status: 'loading' });
  get returnPage(): number {
    const page = Number(this.route.snapshot.queryParamMap.get('page') ?? 1);
    return Number.isSafeInteger(page) && page > 0 && (page - 1) * 20 <= 2147483647 ? page : 1;
  }

  constructor() {
    combineLatest([this.route.paramMap, this.retryRequests.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) => {
          const id = Number(params.get('id'));
          if (!Number.isSafeInteger(id) || id < 1 || id > 2147483647) {
            return of<ResultsState>({ status: 'loadError', message: 'מזהה הבקרה אינו תקין.' });
          }
          return forkJoin({ saved: this.rules.get(id), metadata: this.metadata.get() }).pipe(
            switchMap((snapshot) =>
              this.rules.execute(snapshot.saved.definition).pipe(
                map((result): ResultsState => ({ status: 'ready', ...snapshot, result })),
                catchError((error) =>
                  of<ResultsState>({
                    status: 'executionError',
                    ...snapshot,
                    message: this.errorMessage(error),
                  }),
                ),
                startWith<ResultsState>({ status: 'running', ...snapshot }),
              ),
            ),
            catchError((error) =>
              of<ResultsState>({ status: 'loadError', message: this.errorMessage(error) }),
            ),
            startWith<ResultsState>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => this.state.set(state));
  }

  retry(): void {
    this.retryRequests.next();
  }

  private errorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 404) return 'הבקרה לא נמצאה. ייתכן שנמחקה.';
      if (error.status === 504) return 'ההרצה חרגה מזמן ההמתנה. ניתן לנסות שוב.';
      if (error.status === 400) return 'לא ניתן להריץ את הגדרת הבקרה מול הנתונים הנוכחיים.';
    }
    return 'לא ניתן להשלים את הפעולה. בדקו את החיבור לשרת ונסו שוב.';
  }
}
