import { MetadataResponse, RuleCondition } from '../../core/api/api.models';
import { ruleSummary } from './rule-summary';

const metadata: MetadataResponse = {
  version: 1,
  entities: [
    {
      id: 'employee',
      label: 'עובדים',
      fields: [
        { id: 'salary', label: 'שכר', type: 'number' },
        { id: 'active', label: 'עובד פעיל', type: 'boolean' },
        { id: 'start', label: 'תחילת העסקה', type: 'date' },
        { id: 'end', label: 'סיום העסקה', type: 'date' },
      ],
    },
    {
      id: 'department',
      label: 'מחלקות',
      fields: [{ id: 'active', label: 'מחלקה פעילה', type: 'boolean' }],
    },
  ],
  relationships: [
    {
      id: 'department',
      label: 'מחלקת העובד',
      fromEntity: 'employee',
      toEntity: 'department',
      cardinality: 'manyToOne',
    },
  ],
};
const salary: RuleCondition = {
  kind: 'comparison',
  left: { fieldId: 'salary' },
  operator: 'greaterThan',
  right: { kind: 'constant', value: 0 },
};

describe('Business rule summary', () => {
  it('preserves group boundaries, typed false/zero and related field context', () => {
    const rule: RuleCondition = {
      kind: 'group',
      operator: 'and',
      children: [
        salary,
        {
          kind: 'group',
          operator: 'or',
          children: [
            {
              kind: 'comparison',
              left: { fieldId: 'active', relationshipPath: ['department'] },
              operator: 'equals',
              right: { kind: 'constant', value: false },
            },
            { kind: 'comparison', left: { fieldId: 'active' }, operator: 'isNull' },
          ],
        },
      ],
    };
    expect(ruleSummary(rule, 'employee', metadata)).toBe(
      'כל הבאים מתקיימים: (שכר גדול מ־ 0; וגם לפחות אחד מהבאים מתקיים: (מחלקת העובד › מחלקה פעילה שווה ל־ לא; או עובד פעיל חסר))',
    );
  });
  it('shows field comparison labels, formatted dates and incomplete values without inventing data', () => {
    expect(
      ruleSummary(
        {
          kind: 'comparison',
          left: { fieldId: 'salary' },
          operator: 'equals',
          right: { kind: 'constant', value: '' },
        },
        'employee',
        metadata,
      ),
    ).toContain('טקסט ריק');
    expect(
      ruleSummary(
        {
          kind: 'comparison',
          left: { fieldId: 'start' },
          operator: 'lessThan',
          right: { kind: 'field', field: { fieldId: 'end' } },
        },
        'employee',
        metadata,
      ),
    ).toBe('תחילת העסקה קטן מ־ סיום העסקה');
    expect(
      ruleSummary(
        {
          kind: 'comparison',
          left: { fieldId: 'start' },
          operator: 'equals',
          right: { kind: 'constant', value: '2026-11-15' },
        },
        'employee',
        metadata,
      ),
    ).toContain('15/11/2026');
    expect(
      ruleSummary({ ...salary, right: { kind: 'constant', value: null } }, 'employee', metadata),
    ).toContain('ערך שטרם הוזן');
  });
});
