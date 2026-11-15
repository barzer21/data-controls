import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap } from 'rxjs';
import { MetadataResponse, SavedRuleResponse } from '../../../core/api/api.models';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RuleLibraryNavigationService } from '../../../core/routing/rule-library-navigation.service';
import { ruleListPage } from '../../../core/routing/rule-list-page';
import { RuleEditorComponent } from '../rule-editor/rule-editor.component';

type EditorPageState =
  | { status: 'loading' }
  | { status: 'error'; message: string; retryable: boolean }
  | { status: 'ready'; id: number | null; metadata: MetadataResponse };

@Component({
  selector: 'app-rule-editor-page',
  imports: [RuleEditorComponent, RouterLink],
  templateUrl: './rule-editor-page.component.html',
  styleUrl: './rule-editor-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleEditorPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly libraryNavigation = inject(RuleLibraryNavigationService);
  readonly isCreation = this.route.snapshot.routeConfig?.path === 'rules/new';
  private readonly destroyRef = inject(DestroyRef);
  private readonly metadataApi = inject(MetadataApiService);
  private readonly retryRequests = new Subject<void>();
  private readonly editor = viewChild<RuleEditorComponent>('editor');
  private leaveApproved = false;
  private resolveLeave: ((leave: boolean) => void) | null = null;
  readonly state = signal<EditorPageState>({ status: 'loading' });

  get returnPage(): number {
    return ruleListPage(this.route.snapshot.queryParamMap.get('page'));
  }

  constructor() {
    let previousId: number | null = null;
    combineLatest([this.route.paramMap, this.retryRequests.pipe(startWith(undefined))])
      .pipe(
        switchMap(([params]) => {
          const id = this.isCreation ? null : Number(params.get('id'));
          if (id !== null && (!Number.isSafeInteger(id) || id < 1 || id > 2147483647))
            return of<EditorPageState>({
              status: 'error',
              message: 'מזהה הבקרה אינו תקין.',
              retryable: false,
            });
          return this.metadataApi.get().pipe(
            map((metadata): EditorPageState => ({ status: 'ready', id, metadata })),
            catchError(() =>
              of<EditorPageState>({
                status: 'error',
                message: 'לא ניתן לטעון את הנתונים העסקיים. נסו שוב.',
                retryable: true,
              }),
            ),
            startWith<EditorPageState>({ status: 'loading' }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        if (state.status === 'ready' && state.id !== previousId) {
          this.leaveApproved = false;
          previousId = state.id;
        }
        this.state.set(state);
      });
    this.destroyRef.onDestroy(() => this.cancelLeave());
  }

  retry(): void {
    this.retryRequests.next();
  }

  canLeave(): boolean | Promise<boolean> {
    const editor = this.editor();
    if (this.leaveApproved) return true;
    if (editor?.busy()) return false;
    if (!editor?.dirty()) return true;
    this.resolveLeave?.(false);
    return new Promise<boolean>((resolve) => {
      this.resolveLeave = resolve;
      editor.requestClose();
    });
  }

  leave(): void {
    this.leaveApproved = true;
    if (this.resolveLeave) {
      const resolve = this.resolveLeave;
      this.resolveLeave = null;
      resolve(true);
    } else {
      void this.router.navigate(['/rules'], { queryParams: { page: this.returnPage } });
    }
  }

  cancelLeave(): void {
    const resolve = this.resolveLeave;
    this.resolveLeave = null;
    resolve?.(false);
  }

  onSaved(saved: SavedRuleResponse): void {
    this.leaveApproved = true;
    this.libraryNavigation
      .afterSave(saved, this.returnPage, this.isCreation)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
}
