import { apiErrorMessages } from '../../../core/api/api-error-messages';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { EntityPickerComponent } from '../../../shared/entity-picker/entity-picker.component';
import { RuleResultsComponent } from '../../../shared/rule-results/rule-results.component';
import { RuleConditionComponent } from '../../../shared/rule-condition/rule-condition.component';
import { RuleOverviewComponent } from '../../../shared/rule-overview/rule-overview.component';
import { RuleSummaryComponent } from '../../../shared/rule-summary/rule-summary.component';
import { UiIconComponent } from '../../../shared/ui-icon/ui-icon.component';

@Component({
  selector: 'app-rule-editor',
  imports: [
    FormsModule,
    ConditionEditorComponent,
    RuleResultsComponent,
    RuleConditionComponent,
    UiIconComponent,
    EntityPickerComponent,
    RuleOverviewComponent,
    RuleSummaryComponent,
  ],
  templateUrl: './rule-editor.component.html',
  styleUrl: './rule-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleEditorComponent implements OnInit {
  readonly ruleId = input<number | null>(null);
  readonly mode = signal<'edit' | 'view'>('edit');
  readonly hasRelatedFields = computed(() =>
    this.metadata().relationships.some((link) => link.fromEntity === this.draft().rootEntityId),
  );
  readonly initialDefinition = input<RuleDefinition | null>(null);
  readonly requiresApproval = computed(
    () => this.ruleId() === null && this.initialDefinition() !== null,
  );
  readonly proposalApproved = signal(false);
  readonly metadata = input.required<MetadataResponse>();
  readonly closed = output<void>();
  readonly closeCancelled = output<void>();
  readonly saved = output<SavedRuleResponse>();
  private readonly api = inject(RulesApiService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly previewElement = viewChild<ElementRef<HTMLElement>>('draftPreview');
  private readonly errorSummary = viewChild<ElementRef<HTMLElement>>('errorSummary');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly keepEditingButton =
    viewChild<ElementRef<HTMLButtonElement>>('keepEditingButton');
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
    else if (this.initialDefinition()) {
      this.draft.set(structuredClone(this.initialDefinition()!));
      this.dirty.set(true);
    }
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
    this.proposalApproved.set(false);
  }

  updateCondition(condition: RuleCondition): void {
    if (conditionCount(condition) > 100) {
      this.showErrors(['ניתן להגדיר עד 100 תנאים וקבוצות בבקרה.']);
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
    if (this.dirty()) {
      this.confirmClose.set(true);
      afterNextRender(() => this.keepEditingButton()?.nativeElement.focus(), {
        injector: this.injector,
      });
    } else this.close();
  }

  cancelClose(): void {
    this.confirmClose.set(false);
    this.closeCancelled.emit();
    afterNextRender(() => this.closeButton()?.nativeElement.focus(), { injector: this.injector });
  }

  onEscape(event: Event): void {
    event.preventDefault();
    if (this.confirmClose()) this.cancelClose();
    else this.requestClose();
  }

  close(): void {
    if (this.busy()) return;
    this.closed.emit();
  }

  perform(action: 'save' | 'run'): void {
    if (this.busy() || this.loading() || this.loadFailed() || this.pendingRoot()) return;
    if (this.requiresApproval() && !this.proposalApproved()) {
      this.showErrors(['יש לבדוק ולאשר את הצעת הבקרה לפני שמירה או הרצה.']);
      return;
    }
    const definition = structuredClone(this.draft());
    if (!definition.name.trim()) {
      this.showErrors(['יש להזין שם לבקרה.']);
      return;
    }
    if (definition.name.length > 200 || (definition.description?.length ?? 0) > 2000) {
      this.showErrors(['שם הבקרה מוגבל ל־200 תווים והתיאור ל־2,000 תווים.']);
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
            ? this.api.save(this.ruleId(), definition, this.requiresApproval())
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
    this.showErrors(
      apiErrorMessages(error, {
        fallback: 'לא ניתן להשלים את הפעולה. בדקו את החיבור לשרת ונסו שוב.',
        statusMessages: {
          404: 'הבקרה לא נמצאה. ייתכן שנמחקה. ניתן לסגור ולרענן את הרשימה.',
          504: 'הפעולה חרגה מזמן ההמתנה. ניתן לנסות שוב.',
        },
        includeConditionPath: true,
        useProblemTitle: true,
      }),
    );
  }

  private showErrors(messages: readonly string[]): void {
    this.errors.set(messages);
    afterNextRender(() => this.errorSummary()?.nativeElement.focus(), { injector: this.injector });
  }
}
