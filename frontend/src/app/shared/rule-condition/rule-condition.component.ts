import { comparisonOperatorLabel } from '../../core/rules/comparison-operators';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FieldReference, MetadataResponse, RuleCondition } from '../../core/api/api.models';
import { BusinessValuePipe } from '../business-value.pipe';

@Component({
  selector: 'app-rule-condition',
  imports: [BusinessValuePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rule-condition.component.html',
  styleUrl: './rule-condition.component.scss',
})
export class RuleConditionComponent {
  readonly condition = input.required<RuleCondition>();
  readonly rootEntityId = input.required<string>();
  readonly metadata = input.required<MetadataResponse>();

  field(reference: FieldReference): { label: string; type: string | undefined } {
    let entityId = this.rootEntityId();
    const labels: string[] = [];
    for (const id of reference.relationshipPath ?? []) {
      const relationship = this.metadata().relationships.find(
        (r) =>
          r.id.toLowerCase() === id.toLowerCase() &&
          r.fromEntity.toLowerCase() === entityId.toLowerCase(),
      );
      if (!relationship) return { label: 'שדה שאינו זמין במטא־דאטה', type: undefined };
      labels.push(relationship.label);
      entityId = relationship.toEntity;
    }
    const field = this.metadata()
      .entities.find((e) => e.id.toLowerCase() === entityId.toLowerCase())
      ?.fields.find((f) => f.id.toLowerCase() === reference.fieldId.toLowerCase());
    labels.push(field?.label ?? 'שדה שאינו זמין במטא־דאטה');
    return { label: labels.join(' › '), type: field?.type };
  }

  operatorLabel(operator: string): string {
    return comparisonOperatorLabel(operator) ?? 'השוואה שאינה נתמכת בתצוגה';
  }
}
