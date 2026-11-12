import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, forkJoin, map, of, startWith, Subject, switchMap } from 'rxjs';
import {
  MetadataResponse,
  RuleListResponse,
  SavedRuleResponse,
} from '../../../core/api/api.models';
import { RuleEditorDialogComponent } from '../rule-editor-dialog/rule-editor-dialog.component';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RulesApiService } from '../../../core/api/rules-api.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { SavedRulesListComponent } from '../saved-rules-list/saved-rules-list.component';

type PageState =
  | { status: 'loading'; page: number }
  | { status: 'error'; page: number }
  | { status: 'loaded'; page: number; result: RuleListResponse; metadata: MetadataResponse };

@Component({
  selector: 'app-saved-rules-page',
  imports: [SavedRulesListComponent, PaginationComponent, RuleEditorDialogComponent],
  templateUrl: './saved-rules-page.component.html',
  styleUrl: './saved-rules-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavedRulesPageComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly rulesApi = inject(RulesApiService);
  private readonly metadataApi = inject(MetadataApiService);
  private readonly pageRequests = new Subject<number>();
  readonly state = signal<PageState>({ status: 'loading', page: 1 });
  readonly pageSize = 20;
  readonly editor = signal<{ id: number | null; metadata: MetadataResponse } | null>(null);
  readonly saveNotice = signal('');

  constructor() {
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
    if (Number.isInteger(page) && page > 0) this.pageRequests.next(page);
  }

  runRule(id: number): void {
    void this.router.navigate(['/rules', id, 'results'], {
      queryParams: { page: this.state().page },
    });
  }

  openEditor(id: number | null): void {
    const state = this.state();
    if (state.status === 'loaded') {
      this.saveNotice.set('');
      this.editor.set({ id, metadata: state.metadata });
    }
  }

  onSaved(saved: SavedRuleResponse): void {
    const created = this.editor()?.id === null;
    const state = this.state();
    this.editor.set(null);
    this.saveNotice.set(`הבקרה „${saved.definition.name}” נשמרה בהצלחה.`);
    this.loadPage(
      created && state.status === 'loaded'
        ? Math.max(1, Math.ceil((state.result.totalCount + 1) / this.pageSize))
        : state.page,
    );
  }

  private initialPage(): number {
    const page = Number(this.route.snapshot.queryParamMap.get('page') ?? 1);
    return Number.isSafeInteger(page) && page > 0 && (page - 1) * this.pageSize <= 2147483647
      ? page
      : 1;
  }
}
