using DataControls.Api.Rules;

namespace DataControls.Api.Contracts;

public sealed record SavedRuleResponse(int Id, RuleDefinition Definition, int DefinitionVersion,
    DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc);

public sealed record RuleSummaryResponse(int Id, string Name, string? Description, string RootEntityId,
    int DefinitionVersion, DateTimeOffset CreatedAtUtc, DateTimeOffset UpdatedAtUtc);

public sealed record RuleListResponse(IReadOnlyList<RuleSummaryResponse> Items, int TotalCount,
    int Page, int PageSize);
