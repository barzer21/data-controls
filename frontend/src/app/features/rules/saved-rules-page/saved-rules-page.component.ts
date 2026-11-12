import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import { MetadataResponse, RuleListResponse } from '../../../core/api/api.models';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RulesApiService } from '../../../core/api/rules-api.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { SavedRulesListComponent } from '../saved-rules-list/saved-rules-list.component';

type PageState =
  | { status: 'loading'; page: number }
  | { status: 'error'; page: number }
  | { status: 'loaded'; page: number; result: RuleListResponse; metadata: MetadataResponse };

@Component({
  selector: 'app-saved-rules-page',
  imports: [SavedRulesListComponent, PaginationComponent],
  templateUrl: './saved-rules-page.component.html',
  styleUrl: './saved-rules-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavedRulesPageComponent {
  private readonly rulesApi = inject(RulesApiService);
  private readonly metadataApi = inject(MetadataApiService);
  private readonly pageRequests = new Subject<number>();
  readonly state = signal<PageState>({ status: 'loading', page: 1 });
  readonly pageSize = 20;

  constructor() {
    this.pageRequests
      .pipe(
        startWith(1),
        // Cancel previous requests so an old response cannot replace the selected page.
        switchMap((page) =>
          forkJoin({
            result: this.rulesApi.list(page, this.pageSize),
            metadata: this.metadataApi.get(),
          }).pipe(
            map(({ result, metadata }): PageState => ({
              status: 'loaded',
              page: result.page,
              result,
              metadata,
            })),
            catchError(() => of<PageState>({ status: 'error', page })),
            startWith<PageState>({ status: 'loading', page }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        // Another client may delete the last rule on a page between requests.
        if (state.status === 'loaded' && state.result.items.length === 0 && state.page > 1) {
          this.loadPage(
            Math.min(
              state.page - 1,
              Math.max(1, Math.ceil(state.result.totalCount / state.result.pageSize)),
            ),
          );
        } else {
          this.state.set(state);
        }
      });
  }

  loadPage(page: number): void {
    if (Number.isInteger(page) && page > 0) this.pageRequests.next(page);
  }
}
