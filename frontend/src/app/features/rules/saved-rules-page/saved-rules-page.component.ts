import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, finalize, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import { apiErrorMessages } from '../../../core/api/api-error-messages';
import { MetadataResponse, RuleListResponse } from '../../../core/api/api.models';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RulesApiService } from '../../../core/api/rules-api.service';
import { RULE_LIST_PAGE_SIZE, ruleListPage } from '../../../core/routing/rule-list-page';
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly rulesApi = inject(RulesApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly metadataApi = inject(MetadataApiService);
  private readonly pageRequests = new Subject<number>();
  readonly state = signal<PageState>({ status: 'loading', page: 1 });
  readonly pageSize = RULE_LIST_PAGE_SIZE;
  readonly saveNotice = signal('');
  readonly pendingDeleteId = signal<number | null>(null);
  readonly deletingId = signal<number | null>(null);
  readonly deleteError = signal('');

  constructor() {
    const navigationState = this.location.getState() as { saveNotice?: unknown } | null;
    if (typeof navigationState?.saveNotice === 'string')
      this.saveNotice.set(navigationState.saveNotice);
    this.pageRequests
      .pipe(
        startWith(this.initialPage()),
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
          if (state.status === 'loaded') this.location.replaceState('/rules', `page=${state.page}`);
        }
      });
  }

  loadPage(page: number): void {
    if (this.deletingId() !== null) return;
    this.pendingDeleteId.set(null);
    this.deleteError.set('');
    if (Number.isInteger(page) && page > 0) this.pageRequests.next(page);
  }

  requestDelete(id: number): void {
    const state = this.state();
    if (
      this.deletingId() !== null ||
      state.status !== 'loaded' ||
      !state.result.items.some((rule) => rule.id === id)
    )
      return;
    this.pendingDeleteId.set(id);
    this.deleteError.set('');
  }

  cancelDelete(): void {
    if (this.deletingId() !== null) return;
    this.pendingDeleteId.set(null);
    this.deleteError.set('');
  }

  confirmDelete(id: number): void {
    const state = this.state();
    if (this.deletingId() !== null || this.pendingDeleteId() !== id || state.status !== 'loaded')
      return;
    const rule = state.result.items.find((rule) => rule.id === id);
    if (!rule) return;
    this.deletingId.set(id);
    this.deleteError.set('');
    this.saveNotice.set('');
    const finish = (alreadyDeleted: boolean) => {
      this.deletingId.set(null);
      this.saveNotice.set(
        alreadyDeleted ? 'הבקרה כבר אינה קיימת. הרשימה עודכנה.' : `הבקרה „${rule.name}” נמחקה.`,
      );
      this.loadPage(state.page);
    };
    this.rulesApi
      .delete(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingId.set(null)),
      )
      .subscribe({
        next: () => finish(false),
        error: (error: unknown) => {
          if (
            typeof error === 'object' &&
            error !== null &&
            'status' in error &&
            error.status === 404
          ) {
            finish(true);
            return;
          }
          this.deleteError.set(
            apiErrorMessages(error, {
              fallback: 'לא ניתן למחוק את הבקרה כרגע. אפשר לנסות שוב.',
            }).join(' '),
          );
        },
      });
  }

  runRule(id: number): void {
    if (this.deletingId() !== null) return;
    void this.router.navigate(['/rules', id, 'results'], {
      queryParams: { page: this.state().page },
    });
  }

  openEditor(id: number): void {
    if (this.deletingId() !== null) return;
    void this.router.navigate(['/rules', id, 'edit'], {
      queryParams: { page: this.state().page },
    });
  }

  private initialPage(): number {
    return ruleListPage(this.route.snapshot.queryParamMap.get('page'));
  }
}
