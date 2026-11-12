import {
  AfterViewInit,
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, Observable, switchMap, throwError } from 'rxjs';
import {
  MetadataResponse,
  RuleCondition,
  RuleDefinition,
  RuleExecutionResponse,
  SavedRuleResponse,
} from '../../../core/api/api.models';
import { RulesApiService } from '../../../core/api/rules-api.service';
import { ConditionEditorComponent } from '../../../shared/condition-editor/condition-editor.component';
import {
  conditionCount,
  editableFields,
  newComparison,
} from '../../../shared/condition-editor/condition-editor.model';
import { ExecutionResultsComponent } from '../../../shared/execution-results/execution-results.component';
import { RuleConditionComponent } from '../../../shared/rule-condition/rule-condition.component';

@Component({
  selector: 'app-rule-editor-dialog',
  imports: [
    FormsModule,
    ConditionEditorComponent,
    ExecutionResultsComponent,
    RuleConditionComponent,
  ],
  templateUrl: './rule-editor-dialog.component.html',
  styleUrl: './rule-editor-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleEditorDialogComponent implements OnInit, AfterViewInit {
  readonly ruleId = input<number | null>(null);
  readonly metadata = input.required<MetadataResponse>();
  readonly closed = output<void>();
  readonly saved = output<SavedRuleResponse>();
  private readonly api = inject(RulesApiService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly previewElement = viewChild<ElementRef<HTMLElement>>('draftPreview');
  readonly draft = signal<RuleDefinition>({
    name: '',
    description: '',
    rootEntityId: '',
    condition: newComparison([]),
  });
  readonly loading = signal(false);
  readonly loadFailed = signal(false);
  readonly busy = signal<'save' | 'run' | null>(null);
  readonly errors = signal<readonly string[]>([]);
  readonly dirty = signal(false);
  readonly confirmClose = signal(false);
  readonly pendingRoot = signal<string | null>(null);
  readonly preview = signal<{ definition: RuleDefinition; result: RuleExecutionResponse } | null>(
    null,
  );

  ngOnInit(): void {
    const rootEntityId = this.metadata().entities[0]?.id ?? '';
    this.draft.set({
      name: '',
      description: '',
      rootEntityId,
      condition: newComparison(editableFields(this.metadata(), rootEntityId)),
    });
    if (this.ruleId() !== null) this.load();
  }

  ngAfterViewInit(): void {
    const element = this.dialog().nativeElement;
    element.showModal();
    this.destroyRef.onDestroy(() => element.close());
  }

  load(): void {
    const id = this.ruleId();
    if (id === null || this.loading()) return;
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errors.set([]);
    this.api
      .get(id)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (saved) => {
          this.draft.set(structuredClone(saved.definition));
          this.dirty.set(false);
        },
        error: (error) => {
          this.loadFailed.set(true);
          this.showError(error);
        },
      });
  }

  update(patch: Partial<RuleDefinition>): void {
    this.draft.update((draft) => ({ ...draft, ...patch }));
    this.dirty.set(true);
    this.errors.set([]);
    this.preview.set(null);
    this.confirmClose.set(false);
  }

  updateCondition(condition: RuleCondition): void {
    if (conditionCount(condition) > 100) {
      this.errors.set(['ניתן להגדיר עד 100 תנאים וקבוצות בבקרה.']);
      return;
    }
    this.update({ condition });
  }

  requestRoot(value: string): void {
    this.pendingRoot.set(value !== this.draft().rootEntityId ? value : null);
  }

  applyRoot(): void {
    const rootEntityId = this.pendingRoot();
    if (rootEntityId === null) return;
    this.update({
      rootEntityId,
      condition: newComparison(editableFields(this.metadata(), rootEntityId)),
    });
    this.pendingRoot.set(null);
  }

  requestClose(): void {
    if (this.busy()) return;
    if (this.dirty()) this.confirmClose.set(true);
    else this.close();
  }

  close(): void {
    if (this.busy()) return;
    this.dialog().nativeElement.close();
    this.closed.emit();
  }

  perform(action: 'save' | 'run'): void {
    if (this.busy() || this.loading() || this.loadFailed() || this.pendingRoot()) return;
    const definition = structuredClone(this.draft());
    if (!definition.name.trim()) {
      this.errors.set(['יש להזין שם לבקרה.']);
      return;
    }
    if (definition.name.length > 200 || (definition.description?.length ?? 0) > 2000) {
      this.errors.set(['שם הבקרה מוגבל ל־200 תווים והתיאור ל־2,000 תווים.']);
      return;
    }
    this.busy.set(action);
    this.errors.set([]);
    this.preview.set(null);
    this.api
      .validate(definition)
      .pipe(
        switchMap((validation): Observable<SavedRuleResponse | RuleExecutionResponse> => {
          if (!validation.isValid)
            return throwError(() => ({ validationErrors: validation.errors }));
          return action === 'save'
            ? this.api.save(this.ruleId(), definition)
            : this.api.execute(definition);
        }),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.busy.set(null)),
      )
      .subscribe({
        next: (response) => {
          if (action === 'save') {
            this.dirty.set(false);
            this.saved.emit(response as SavedRuleResponse);
          } else {
            this.preview.set({ definition, result: response as RuleExecutionResponse });
            afterNextRender(
              () =>
                this.previewElement()?.nativeElement.scrollIntoView?.({
                  block: 'start',
                  behavior: 'smooth',
                }),
              { injector: this.injector },
            );
          }
        },
        error: (error) => this.showError(error),
      });
  }

  private showError(error: unknown): void {
    const body = error instanceof HttpErrorResponse ? error.error : error;
    const semanticErrors = body?.errors ?? body?.validationErrors;
    if (
      Array.isArray(semanticErrors) &&
      semanticErrors.every((item) => typeof item.message === 'string')
    ) {
      this.errors.set(
        semanticErrors.map((item) => {
          const indices = [...String(item.path ?? '').matchAll(/children\[(\d+)\]/g)].map(
            (match) => `תנאי ${Number(match[1]) + 1}`,
          );
          return `${indices.length ? indices.join(' › ') + ': ' : ''}${item.message}`;
        }),
      );
    } else if (error instanceof HttpErrorResponse && error.status === 404) {
      this.errors.set(['הבקרה לא נמצאה. ייתכן שנמחקה. ניתן לסגור ולרענן את הרשימה.']);
    } else if (error instanceof HttpErrorResponse && error.status === 504) {
      this.errors.set(['הפעולה חרגה מזמן ההמתנה. ניתן לנסות שוב.']);
    } else {
      this.errors.set(['לא ניתן להשלים את הפעולה. בדקו את החיבור לשרת ונסו שוב.']);
    }
  }
}
