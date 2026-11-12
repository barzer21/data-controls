using System.Text.Json;
using System.Text.Json.Serialization;

namespace DataControls.Api.Rules;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RuleDefinition(string? Name, string? Description, string? RootEntityId,
    RuleCondition? Condition, IReadOnlyList<FieldReference?>? ResultFields = null);

[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(RuleGroup), "group")]
[JsonDerivedType(typeof(RuleComparison), "comparison")]
public abstract record RuleCondition;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RuleGroup(string? Operator, IReadOnlyList<RuleCondition?>? Children) : RuleCondition;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RuleComparison(FieldReference? Left, string? Operator, RuleOperand? Right = null)
    : RuleCondition;

// An omitted relationshipPath means a field on the root entity.
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record FieldReference(string? FieldId, IReadOnlyList<string?>? RelationshipPath = null);

[JsonPolymorphic(TypeDiscriminatorPropertyName = "kind")]
[JsonDerivedType(typeof(ConstantOperand), "constant")]
[JsonDerivedType(typeof(FieldOperand), "field")]
public abstract record RuleOperand;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ConstantOperand(JsonElement Value) : RuleOperand;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record FieldOperand(FieldReference? Field) : RuleOperand;
