from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class MetadataField(ContractModel):
    id: str = Field(min_length=1, strict=True)
    label: str = Field(min_length=1, strict=True)
    type: Literal["text", "number", "date", "boolean"]


class MetadataEntity(ContractModel):
    id: str = Field(min_length=1, strict=True)
    label: str = Field(min_length=1, strict=True)
    fields: list[MetadataField] = Field(min_length=1)


class MetadataRelationship(ContractModel):
    id: str = Field(min_length=1, strict=True)
    label: str = Field(min_length=1, strict=True)
    fromEntity: str = Field(min_length=1, strict=True)
    toEntity: str = Field(min_length=1, strict=True)
    cardinality: Literal["manyToOne"]


class BusinessMetadata(ContractModel):
    version: int = Field(ge=1, strict=True)
    entities: list[MetadataEntity] = Field(min_length=1)
    relationships: list[MetadataRelationship]


class ProposalRequest(ContractModel):
    description: str = Field(
        min_length=1,
        max_length=2000,
        strict=True,
        examples=["מצאי עובדים שהשכר שלהם גבוה מ-15000."],
    )
    metadata: BusinessMetadata


class FieldReference(ContractModel):
    fieldId: str = Field(min_length=1, strict=True)
    relationshipPath: list[str] | None = Field(default=None, max_length=4)


class FieldOperand(ContractModel):
    kind: Literal["field"]
    field: FieldReference


class ConstantOperand(ContractModel):
    kind: Literal["constant"]
    value: str | int | float | bool | None


class ComparisonCondition(ContractModel):
    kind: Literal["comparison"]
    left: FieldReference
    operator: Literal[
        "equals", "notEquals", "lessThan", "lessThanOrEqual",
        "greaterThan", "greaterThanOrEqual", "isNull", "isNotNull",
    ]
    right: FieldOperand | ConstantOperand | None = Field(default=None, discriminator="kind")

    @model_validator(mode="after")
    def validate_right(self):
        if self.operator in ("isNull", "isNotNull"):
            if self.right is not None:
                raise ValueError("Missing-value checks must not have a right operand.")
        elif self.right is None:
            raise ValueError("This comparison requires a right operand.")
        elif isinstance(self.right, ConstantOperand) and self.right.value is None:
            raise ValueError("Use isNull or isNotNull to check for missing values.")
        return self


class GroupCondition(ContractModel):
    kind: Literal["group"]
    operator: Literal["and", "or"]
    children: list["RuleCondition"] = Field(min_length=1, max_length=100)


RuleCondition = Annotated[
    ComparisonCondition | GroupCondition,
    Field(discriminator="kind"),
]

GroupCondition.model_rebuild()


class RuleProposal(ContractModel):
    name: str = Field(min_length=1, max_length=200, strict=True)
    description: str | None = Field(default=None, max_length=2000)
    rootEntityId: str = Field(min_length=1, strict=True)
    condition: RuleCondition

    @field_validator("name", "description")
    @classmethod
    def validate_text(cls, value, info):
        if value is None:
            return value
        if info.field_name == "name" and not value.strip():
            raise ValueError("Rule name must not be blank.")
        limit = 200 if info.field_name == "name" else 2000
        # .NET string.Length counts UTF-16 code units, not Unicode code points.
        if len(value.encode("utf-16-le")) // 2 > limit:
            raise ValueError(f"{info.field_name} exceeds {limit} UTF-16 code units.")
        return value

    @model_validator(mode="after")
    def validate_tree_limits(self):
        count = 0
        pending = [(self.condition, 1)]
        while pending:
            node, depth = pending.pop()
            count += 1
            if count > 100:
                raise ValueError("A rule supports at most 100 condition nodes.")
            if depth > 8:
                raise ValueError("A rule supports at most 8 condition levels.")
            if isinstance(node, GroupCondition):
                pending.extend((child, depth + 1) for child in node.children)
        return self
