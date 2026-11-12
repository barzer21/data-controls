using DataControls.Api.Metadata;

namespace DataControls.Api.Rules;

public static class RuleExecutionOptionsValidator
{
    public const int MaxSearchLength = 200;

    // Called only after the definition and its resultFields have passed RuleValidator.
    public static RuleValidationResult Validate(RuleDefinition definition, RuleExecutionOptions options,
        MetadataCatalog catalog, RuleValidator validator)
    {
        var errors = new List<RuleValidationError>();
        var root = catalog.Entities.Single(e => Same(e.Id, definition.RootEntityId));
        var selected = definition.ResultFields ?? root.Fields.Select(f => new FieldReference(f.Id)).ToArray();
        var allowed = selected.Select(f => Key(f!)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (options.Search?.Length > MaxSearchLength)
            errors.Add(new("options.search", "searchTooLong", $"טקסט החיפוש מוגבל ל־{MaxSearchLength} תווים."));
        else if (!string.IsNullOrWhiteSpace(options.Search) && !selected.Any(f => Resolve(f!).Type == "text"))
            errors.Add(new("options.search", "noSearchableFields", "אין בתוצאות שדות טקסט שניתן לחפש בהם."));

        if (options.Filter is not null)
        {
            var validation = validator.Validate(definition with { Condition = options.Filter });
            if (!validation.IsValid)
                errors.AddRange(validation.Errors.Select(e => e with
                {
                    Path = e.Path.StartsWith("condition", StringComparison.Ordinal)
                        ? "options.filter" + e.Path["condition".Length..] : e.Path
                }));
            else Check(options.Filter, "options.filter");
        }
        return new(errors.Count == 0, errors.ToArray());

        MetadataField Resolve(FieldReference reference)
        {
            var entity = root;
            foreach (var id in reference.RelationshipPath ?? [])
            {
                var relationship = catalog.Relationships.Single(r => Same(r.Id, id));
                entity = catalog.Entities.Single(e => Same(e.Id, relationship.ToEntity));
            }
            return entity.Fields.Single(f => Same(f.Id, reference.FieldId));
        }

        void Check(RuleCondition condition, string path)
        {
            if (condition is RuleGroup group)
                for (var i = 0; i < group.Children!.Count; i++) Check(group.Children[i]!, $"{path}.children[{i}]");
            else if (condition is RuleComparison comparison)
            {
                CheckField(comparison.Left!, path + ".left");
                if (comparison.Right is FieldOperand operand) CheckField(operand.Field!, path + ".right.field");
            }
        }
        void CheckField(FieldReference reference, string path)
        {
            if (!allowed.Contains(Key(reference)))
                errors.Add(new(path, "filterFieldNotDisplayed", "ניתן לסנן רק לפי שדות שנבחרו לתוצאות."));
        }
    }

    private static string Key(FieldReference reference) =>
        string.Join(".", (reference.RelationshipPath ?? []).Append(reference.FieldId));
    private static bool Same(string? left, string? right) => string.Equals(left, right, StringComparison.OrdinalIgnoreCase);
}
