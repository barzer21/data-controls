using DataControls.Api.Rules;

namespace DataControls.Api.Ai;

public sealed record AiRuleProposalResult(RuleDefinition Definition, RuleValidationResult Validation);

public interface IAiRuleProposalProvider
{
    Task<AiRuleProposalResult> ProposeAsync(string description, CancellationToken cancellationToken);
}
