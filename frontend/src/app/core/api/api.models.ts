export interface RuleSummary {
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
