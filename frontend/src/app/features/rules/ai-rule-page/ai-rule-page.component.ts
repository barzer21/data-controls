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
import { MetadataResponse, RuleDefinition, SavedRuleResponse } from '../../../core/api/api.models';
import { MetadataApiService } from '../../../core/api/metadata-api.service';
import { RuleLibraryNavigationService } from '../../../core/routing/rule-library-navigation.service';
import { ruleListPage } from '../../../core/routing/rule-list-page';
import { AiRuleCreatorComponent } from '../ai-rule-creator/ai-rule-creator.component';
import { RuleEditorComponent } from '../rule-editor/rule-editor.component';

@Component({
  selector: 'app-ai-rule-page',
  imports: [AiRuleCreatorComponent, RuleEditorComponent, RouterLink],
  templateUrl: './ai-rule-page.component.html',
  styleUrl: './ai-rule-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiRulePageComponent {
  private readonly metadataApi = inject(MetadataApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly libraryNavigation = inject(RuleLibraryNavigationService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly creator = viewChild<AiRuleCreatorComponent>('creator');
  private readonly editor = viewChild<RuleEditorComponent>('editor');
  private leaveApproved = false;
  private resolveLeave: ((leave: boolean) => void) | null = null;
  readonly metadata = signal<MetadataResponse | null>(null);
  readonly proposal = signal<RuleDefinition | null>(null);
  readonly error = signal('');

  get returnPage(): number {
    return ruleListPage(this.route.snapshot.queryParamMap.get('page'));
  }

  constructor() {
    this.loadMetadata();
    this.destroyRef.onDestroy(() => this.cancelLeave());
  }

  loadMetadata(): void {
    this.error.set('');
    this.metadataApi
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (metadata) => this.metadata.set(metadata),
        error: () => this.error.set('לא ניתן לטעון את הנתונים העסקיים. נסו שוב.'),
      });
  }

  canLeave(): boolean | Promise<boolean> {
    if (this.leaveApproved) return true;
    const editor = this.editor();
    const creator = this.creator();
    if (editor?.busy()) return false;
    if (!editor?.dirty() && (!creator?.description().trim() || creator.busy())) return true;
    this.resolveLeave?.(false);
    return new Promise((resolve) => {
      this.resolveLeave = resolve;
      if (editor) editor.requestClose();
      else creator?.requestClose();
    });
  }

  leave(): void {
    this.leaveApproved = true;
    const resolve = this.resolveLeave;
    this.resolveLeave = null;
    if (resolve) resolve(true);
    else void this.router.navigate(['/rules'], { queryParams: { page: this.returnPage } });
  }

  cancelLeave(): void {
    const resolve = this.resolveLeave;
    this.resolveLeave = null;
    resolve?.(false);
  }

  onSaved(saved: SavedRuleResponse): void {
    this.leaveApproved = true;
    this.libraryNavigation
      .afterSave(saved, this.returnPage, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }
}
