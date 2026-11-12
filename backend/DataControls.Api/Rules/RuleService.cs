using System.Text.Json;
using DataControls.Api.Contracts;
using DataControls.Api.Data;
using DataControls.Api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Mvc;

namespace DataControls.Api.Rules;

public sealed record RuleSaveResult(RuleValidationResult Validation, SavedRuleResponse? Rule);

// EF Core owns persistence; rule validation stays independent from it.
public sealed class RuleService(AppDbContext db, RuleValidator validator, IOptions<JsonOptions> jsonOptions)
{
    private readonly JsonSerializerOptions serializerOptions = jsonOptions.Value.JsonSerializerOptions;

    public async Task<RuleListResponse> ListAsync(int page, int pageSize, CancellationToken cancellationToken)
    {
        var totalCount = await db.Rules.CountAsync(cancellationToken);
        var items = await db.Rules.AsNoTracking().OrderBy(r => r.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(r => new RuleSummaryResponse(r.Id, r.Name, r.Description, r.RootEntityId,
                r.DefinitionVersion, r.CreatedAtUtc, r.UpdatedAtUtc))
            .ToListAsync(cancellationToken);
        return new(items, totalCount, page, pageSize);
    }

    public async Task<SavedRuleResponse?> GetAsync(int id, CancellationToken cancellationToken)
    {
        var rule = await db.Rules.AsNoTracking().SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
        return rule is null ? null : ToResponse(rule);
    }

    public async Task<RuleSaveResult> SaveAsync(int? id, RuleDefinition definition, CancellationToken cancellationToken)
    {
        // Both create and update must pass the same validator as manual/AI proposals.
        var validation = validator.Validate(definition);
        if (!validation.IsValid) return new(validation, null);

        var rule = id.HasValue
            ? await db.Rules.SingleOrDefaultAsync(r => r.Id == id.Value, cancellationToken)
            : new SavedRule { CreatedAtUtc = DateTimeOffset.UtcNow };
        if (rule is null) return new(validation, null);

        rule.Name = definition.Name!;
        rule.Description = definition.Description;
        rule.RootEntityId = definition.RootEntityId!;
        rule.ConditionJson = JsonSerializer.Serialize<RuleCondition>(definition.Condition!, serializerOptions);
        rule.UpdatedAtUtc = DateTimeOffset.UtcNow;
        if (!id.HasValue) db.Rules.Add(rule);
        await db.SaveChangesAsync(cancellationToken);
        return new(validation, ToResponse(rule));
    }

    public async Task<bool> DeleteAsync(int id, CancellationToken cancellationToken)
    {
        var rule = await db.Rules.SingleOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (rule is null) return false;
        db.Rules.Remove(rule);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    private SavedRuleResponse ToResponse(SavedRule rule)
    {
        if (rule.DefinitionVersion != 1)
            throw new InvalidOperationException($"Unsupported stored rule version: {rule.DefinitionVersion}.");
        var condition = JsonSerializer.Deserialize<RuleCondition>(rule.ConditionJson, serializerOptions)
            ?? throw new InvalidOperationException($"Stored rule {rule.Id} has an empty condition.");
        return new(rule.Id, new(rule.Name, rule.Description, rule.RootEntityId, condition),
            rule.DefinitionVersion, rule.CreatedAtUtc, rule.UpdatedAtUtc);
    }
}
