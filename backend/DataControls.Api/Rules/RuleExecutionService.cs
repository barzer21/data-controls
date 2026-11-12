namespace DataControls.Api.Rules;

public sealed record RuleExecutionAttempt(RuleValidationResult Validation, RuleExecutionResponse? Result);

public sealed class RuleExecutionService(RuleSqlCompiler compiler, RuleExecutor executor)
{
    public async Task<RuleExecutionAttempt> ExecuteAsync(RuleDefinition definition, int limit,
        CancellationToken cancellationToken)
    {
        var compilation = compiler.Compile(definition);
        if (!compilation.Validation.IsValid) return new(compilation.Validation, null);
        return new(compilation.Validation, await executor.ExecuteAsync(compilation.Query!, limit, cancellationToken));
    }
}
