using DataControls.Api.Metadata;

namespace DataControls.Api.Rules;

public static class RuleResultSchema
{
    // The server catalog owns the projection. Requests cannot choose result columns.
    public static IReadOnlyList<FieldReference> Fields(MetadataCatalog catalog, string rootEntityId)
    {
        var root = catalog.Entities.Single(e => string.Equals(e.Id, rootEntityId, StringComparison.OrdinalIgnoreCase));
        return root.Fields.Select(f => new FieldReference(f.Id))
            .Concat((root.RelatedColumns ?? []).Select(f => new FieldReference(f.FieldId, f.RelationshipPath)))
            .ToArray();
    }
}
