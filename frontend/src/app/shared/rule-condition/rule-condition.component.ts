import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FieldReference, MetadataResponse, RuleCondition } from '../../core/api/api.models';
import { BusinessValuePipe } from '../business-value.pipe';

@Component({
  selector: 'app-rule-condition',
  imports: [BusinessValuePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let node = condition();
    @if (node.kind === 'group') {
      <div class="group" [class.or-group]="node.operator === 'or'">
        <strong>{{
          node.operator === 'and'
            ? 'כל התנאים הבאים מתקיימים (וגם):'
            : 'לפחות אחד מהתנאים הבאים מתקיים (או):'
        }}</strong>
        <ul>
          @for (child of node.children; track $index) {
            <li>
              <app-rule-condition
                [condition]="child"
                [rootEntityId]="rootEntityId()"
                [metadata]="metadata()"
              />
            </li>
          }
        </ul>
      </div>
    } @else {
      <span
        >{{ field(node.left).label }} {{ operatorLabel(node.operator) }}
        @if (node.right; as right) {
          @if (right.kind === 'field') {
            {{ field(right.field).label }}
          } @else {
            <bdi>{{ right.value | businessValue: field(node.left).type }}</bdi>
          }
        }
      </span>
    }
  `,
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
    const labels: Record<string, string> = {
      equals: 'שווה ל־',
      notEquals: 'שונה מ־',
      greaterThan: 'גדול מ־',
      greaterThanOrEqual: 'גדול או שווה ל־',
      lessThan: 'קטן מ־',
      lessThanOrEqual: 'קטן או שווה ל־',
      isNull: 'חסר',
      isNotNull: 'אינו חסר',
    };
    return labels[operator] ?? 'השוואה שאינה נתמכת בתצוגה';
  }
}
