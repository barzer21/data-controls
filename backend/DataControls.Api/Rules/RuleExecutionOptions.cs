using System.Text.Json.Serialization;

namespace DataControls.Api.Rules;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record RuleExecutionOptions(string? Search = null, RuleCondition? Filter = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record DraftRuleExecutionRequest(RuleDefinition? Definition, RuleExecutionOptions? Options = null);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record SavedRuleExecutionRequest(RuleExecutionOptions? Options = null);
