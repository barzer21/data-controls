import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MetadataEntity, RuleSummary } from '../../../core/api/api.models';

@Component({
  selector: 'app-saved-rules-list',
  templateUrl: './saved-rules-list.component.html',
  styleUrl: './saved-rules-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavedRulesListComponent {
  readonly rules = input.required<readonly RuleSummary[]>();
  readonly entities = input.required<readonly MetadataEntity[]>();

  entityLabel(id: string): string {
    return (
      this.entities().find((entity) => entity.id.toLowerCase() === id.toLowerCase())?.label ??
      'סוג נתונים לא זמין'
    );
  }
}
