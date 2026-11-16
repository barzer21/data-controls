import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MetadataResponse, RuleDefinition } from '../../core/api/api.models';
import { RuleConditionComponent } from '../rule-condition/rule-condition.component';
import { UiIconComponent } from '../ui-icon/ui-icon.component';
@Component({
  selector: 'app-rule-overview',
  imports: [RuleConditionComponent, UiIconComponent],
  templateUrl: './rule-overview.component.html',
  styleUrl: './rule-overview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RuleOverviewComponent {
  readonly definition = input.required<RuleDefinition>();
  readonly metadata = input.required<MetadataResponse>();
  readonly unsaved = input(false);
  readonly edit = output<void>();
  readonly entityLabel = computed(
    () =>
      this.metadata().entities.find((e) => e.id === this.definition().rootEntityId)?.label ??
      this.definition().rootEntityId,
  );
}
