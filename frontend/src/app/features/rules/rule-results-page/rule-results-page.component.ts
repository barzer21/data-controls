import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import { MetadataResponse, SavedRuleResponse } from '../../../core/api/api.models';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RulesApiService } from '../../../core/api/rules-api.service';
import { ruleListPage } from '../../../core/routing/rule-list-page';
import { RuleResultsComponent } from '../../../shared/rule-results/rule-results.component';
import { RuleConditionComponent } from '../../../shared/rule-condition/rule-condition.component';

interface Snapshot {
  saved: SavedRuleResponse;
  metadata: MetadataResponse;
}
type ResultsState =
  | { status: 'loading' }
  | { status: 'loadError'; message: string }
  | (Snapshot & { status: 'loaded' });

@Component({
  selector: 'app-rule-results-page',
  imports: [RouterLink, RuleConditionComponent, RuleResultsComponent],
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
    return ruleListPage(this.route.snapshot.queryParamMap.get('page'));
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
            map((snapshot): ResultsState => ({ status: 'loaded', ...snapshot })),
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
    }
    return 'לא ניתן להשלים את הפעולה. בדקו את החיבור לשרת ונסו שוב.';
  }
}
