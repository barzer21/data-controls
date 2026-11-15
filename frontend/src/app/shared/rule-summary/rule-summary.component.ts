import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MetadataResponse, RuleDefinition } from '../../core/api/api.models';
import { ruleSummary } from '../rule-condition/rule-summary';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
@Component({
  selector: 'app-rule-summary',
  imports: [UiIconComponent],
  templateUrl: './rule-summary.component.html',
  styleUrl: './rule-summary.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleSummaryComponent {
  readonly definition = input.required<RuleDefinition>();
  readonly metadata = input.required<MetadataResponse>();
  readonly summary = computed(() =>
    ruleSummary(this.definition().condition, this.definition().rootEntityId, this.metadata()),
  );
}
