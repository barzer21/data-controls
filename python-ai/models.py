from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BusinessMetadataModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MetadataField(BusinessMetadataModel):
    id: str = Field(min_length=1, strict=True)
    label: str = Field(min_length=1, strict=True)
    type: Literal["text", "number", "date", "boolean"]


class MetadataEntity(BusinessMetadataModel):
    id: str = Field(min_length=1, strict=True)
    label: str = Field(min_length=1, strict=True)
    fields: list[MetadataField] = Field(min_length=1)


class MetadataRelationship(BusinessMetadataModel):
    id: str = Field(min_length=1, strict=True)
    label: str = Field(min_length=1, strict=True)
    fromEntity: str = Field(min_length=1, strict=True)
    toEntity: str = Field(min_length=1, strict=True)
    cardinality: Literal["manyToOne"]


class BusinessMetadata(BusinessMetadataModel):
    version: int = Field(ge=1, strict=True)
    entities: list[MetadataEntity] = Field(min_length=1)
    relationships: list[MetadataRelationship]


class ProposalRequest(BaseModel):
    description: str = Field(
        min_length=1,
        max_length=2000,
        strict=True,
        examples=["מצאי עובדים שהשכר שלהם גבוה מ-15000."],
    )
    metadata: BusinessMetadata


class FieldReference(BaseModel):
    fieldId: str = Field(min_length=1, strict=True)
    relationshipPath: list[str] | None = Field(default=None, max_length=4)


class FieldOperand(BaseModel):
    kind: Literal["field"]
    field: FieldReference


class ConstantOperand(BaseModel):
    kind: Literal["constant"]
    value: str | int | float | bool | None


class ComparisonCondition(BaseModel):
    kind: Literal["comparison"]
    left: FieldReference
    operator: Literal["equals", "lessThan", "greaterThan", "isNull", "isNotNull"]
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


class GroupCondition(BaseModel):
    kind: Literal["group"]
    operator: Literal["and", "or"]
    children: list["RuleCondition"] = Field(min_length=1, max_length=100)


RuleCondition = Annotated[
    ComparisonCondition | GroupCondition,
    Field(discriminator="kind"),
]

GroupCondition.model_rebuild()


class RuleProposal(BaseModel):
    name: str = Field(min_length=1, max_length=200, strict=True)
    description: str = Field(max_length=2000, strict=True)
    rootEntityId: str = Field(min_length=1, strict=True)
    condition: RuleCondition
