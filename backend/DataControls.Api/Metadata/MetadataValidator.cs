namespace DataControls.Api.Metadata;

public static class MetadataValidator
{
    public static void Validate(MetadataCatalog catalog)
    {
        Require(catalog.Version == 1, "Only metadata version 1 is supported.");
        Require(catalog.Entities is { Count: > 0 }, "Entities must not be empty.");
        Require(catalog.Relationships is not null, "Relationships must not be null.");
        var entities = new Dictionary<string, MetadataEntity>(StringComparer.OrdinalIgnoreCase);
        foreach (var entity in catalog.Entities!)
        {
            Require(entity is not null, "Entity must not be null.");
            Text(entity!.Id, "Entity ID");
            Require(entities.TryAdd(entity.Id, entity), $"Duplicate entity ID: {entity.Id}.");
            Text(entity.Label, $"Label for {entity.Id}");
            Identifier(entity.Schema); Identifier(entity.Table); Identifier(entity.KeyColumn);
            Require(entity.Fields is { Count: > 0 }, $"Fields are required for {entity.Id}.");
            var fields = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var field in entity.Fields!)
            {
                Require(field is not null, $"Null field in {entity.Id}.");
                Text(field!.Id, "Field ID");
                Require(fields.Add(field.Id), $"Duplicate field ID: {entity.Id}.{field.Id}.");
                Text(field.Label, $"Label for {entity.Id}.{field.Id}");
                if (field.Calculation is null) Identifier(field.Column);
                else
                {
                    Require(field.Column is null, $"Calculated field {entity.Id}.{field.Id} cannot have a SQL column.");
                    Require(field.Calculation.Kind == "age", $"Unsupported calculation: {entity.Id}.{field.Id}.");
                    Require(field.Type == "number", $"Age calculation must have type number: {entity.Id}.{field.Id}.");
                    Text(field.Calculation.SourceFieldId, "Calculation source field ID");
                }
                Require(field.Type is "text" or "number" or "date" or "boolean",
                    $"Unsupported field type: {entity.Id}.{field.Id} ({field.Type}).");
            }
            foreach (var field in entity.Fields.Where(f => f.Calculation is not null))
            {
                var source = entity.Fields.SingleOrDefault(f =>
                    string.Equals(f.Id, field.Calculation!.SourceFieldId, StringComparison.OrdinalIgnoreCase));
                Require(source is { Type: "date", Calculation: null },
                    $"Age calculation {entity.Id}.{field.Id} must reference a physical date field in the same entity.");
            }
        }
        var relationships = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var relationship in catalog.Relationships!)
        {
            Require(relationship is not null, "Relationship must not be null.");
            Text(relationship!.Id, "Relationship ID");
            Require(relationships.Add(relationship.Id), $"Duplicate relationship ID: {relationship.Id}.");
            Text(relationship.Label, $"Label for {relationship.Id}");
            Text(relationship.FromEntity, "Source entity ID");
            Text(relationship.ToEntity, "Target entity ID");
            Require(entities.ContainsKey(relationship.FromEntity) && entities.ContainsKey(relationship.ToEntity),
                $"Unknown entity in relationship {relationship.Id}.");
            Identifier(relationship.FromColumn); Identifier(relationship.ToColumn);
            Require(relationship.Cardinality == "manyToOne",
                $"Only manyToOne relationships are supported: {relationship.Id}.");
            Require(relationship.ToColumn == entities[relationship.ToEntity].KeyColumn,
                $"Relationship {relationship.Id} must target the entity key.");
        }
        var links = catalog.Relationships!.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        foreach (var root in catalog.Entities!)
        {
            var resultIds = root.Fields.Select(f => f.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
            Require(root.RelatedColumns is null or { Count: <= 50 }, $"Too many related result fields for {root.Id}.");
            foreach (var reference in root.RelatedColumns ?? [])
            {
                Require(reference is not null, $"Null related result field for {root.Id}.");
                Text(reference!.FieldId, "Related result field ID");
                Require(reference.RelationshipPath is { Count: >= 1 and <= 4 }, "Related result path must contain 1 to 4 relationships.");
                var entity = root;
                var path = new List<string>();
                foreach (var id in reference.RelationshipPath!)
                {
                    Text(id, "Related result relationship ID");
                    Require(links.TryGetValue(id, out var link), $"Unknown related result relationship: {id}.");
                    Require(string.Equals(link!.FromEntity, entity.Id, StringComparison.OrdinalIgnoreCase),
                        $"Wrong related result direction: {id}.");
                    path.Add(link.Id);
                    entity = entities[link.ToEntity];
                }
                var field = entity.Fields.SingleOrDefault(f => string.Equals(f.Id, reference.FieldId, StringComparison.OrdinalIgnoreCase));
                Require(field is not null, $"Unknown related result field: {reference.FieldId}.");
                Require(resultIds.Add(string.Join(".", path.Append(field!.Id))), $"Duplicate result column for {root.Id}.");
            }
        }
    }

    private static void Text(string? value, string name) =>
        Require(!string.IsNullOrWhiteSpace(value), $"{name} must not be empty.");

    private static void Identifier(string? value) =>
        Require(!string.IsNullOrWhiteSpace(value) && value.Length <= 128 && !value.Contains('\0'),
            $"Invalid SQL identifier: {value}.");

    private static void Require(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException($"Invalid metadata: {message}");
    }
}
