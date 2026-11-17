import { ComparisonOperator } from '../rules/comparison-operators';

export interface RuleSummary {
  readonly createdWithAi?: boolean;
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly rootEntityId: string;
  readonly definitionVersion: number;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface RuleListResponse {
  readonly items: readonly RuleSummary[];
  readonly totalCount: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface MetadataResponse {
  readonly version: number;
  readonly entities: readonly MetadataEntity[];
  readonly relationships: readonly MetadataRelationship[];
}

export interface MetadataEntity {
  readonly id: string;
  readonly label: string;
  readonly fields: readonly {
    readonly id: string;
    readonly label: string;
    readonly type: string;
  }[];
}

export interface MetadataRelationship {
  readonly id: string;
  readonly label: string;
  readonly fromEntity: string;
  readonly toEntity: string;
  readonly cardinality: string;
}

export interface FieldReference {
  readonly fieldId: string;
  readonly relationshipPath?: readonly string[] | null;
}

export type RuleCondition =
  | {
      readonly kind: 'group';
      readonly operator: 'and' | 'or';
      readonly children: readonly RuleCondition[];
    }
  | {
      readonly kind: 'comparison';
      readonly left: FieldReference;
      readonly operator: ComparisonOperator;
      readonly right?: RuleOperand | null;
    };

export type RuleOperand =
  | { readonly kind: 'constant'; readonly value: string | number | boolean | null }
  | { readonly kind: 'field'; readonly field: FieldReference };

export interface RuleDefinition {
  readonly name: string;
  readonly description: string | null;
  readonly rootEntityId: string;
  readonly condition: RuleCondition;
}

export interface SavedRuleResponse {
  readonly createdWithAi?: boolean;
  readonly id: number;
  readonly definition: RuleDefinition;
  readonly definitionVersion: number;
  readonly createdAtUtc: string;
  readonly updatedAtUtc: string;
}

export interface RuleResultColumn {
  readonly id: string;
  readonly label: string;
  readonly type: string;
}

export interface RuleExplanationNode {
  readonly path: string;
  readonly kind: string;
  readonly operator: string;
  readonly message: string;
  readonly left: RuleExplanationOperand | null;
  readonly right: RuleExplanationOperand | null;
  readonly children: readonly RuleExplanationNode[];
}

export interface RuleExplanationOperand {
  readonly kind: string;
  readonly fieldId: string | null;
  readonly label: string | null;
  readonly type: string;
  readonly value: unknown;
}

export interface RuleExecutionResponse {
  readonly totalCount: number;
  /** All root-entity records, before rule conditions, result filters and the row limit. */
  readonly evaluatedCount?: number;
  readonly returnedCount: number;
  readonly truncated: boolean;
  readonly columns: readonly RuleResultColumn[];
  readonly records: readonly {
    readonly id: string | number;
    readonly values: Readonly<Record<string, unknown>>;
    readonly failureReason: string;
    readonly explanation: RuleExplanationNode;
  }[];
}

export interface RuleExecutionOptions {
  readonly search?: string;
  readonly filter?: RuleCondition;
}
