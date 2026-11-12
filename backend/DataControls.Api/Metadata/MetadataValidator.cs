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
                Identifier(field.Column);
                Require(field.Type is "text" or "number" or "date" or "boolean",
                    $"Unsupported field type: {entity.Id}.{field.Id} ({field.Type}).");
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
