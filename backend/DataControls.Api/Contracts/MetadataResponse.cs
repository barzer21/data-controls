using DataControls.Api.Metadata;

namespace DataControls.Api.Contracts;

public sealed record MetadataResponse(int Version, IReadOnlyList<MetadataEntityResponse> Entities,
    IReadOnlyList<MetadataRelationshipResponse> Relationships)
{
    public static MetadataResponse FromCatalog(MetadataCatalog catalog) => new(catalog.Version,
        catalog.Entities.Select(e => new MetadataEntityResponse(e.Id, e.Label,
            e.Fields.Select(f => new MetadataFieldResponse(f.Id, f.Label, f.Type)).ToArray())).ToArray(),
        catalog.Relationships.Select(r => new MetadataRelationshipResponse(r.Id, r.Label,
            r.FromEntity, r.ToEntity, r.Cardinality)).ToArray());
}

public sealed record MetadataEntityResponse(string Id, string Label, IReadOnlyList<MetadataFieldResponse> Fields);
public sealed record MetadataFieldResponse(string Id, string Label, string Type);
public sealed record MetadataRelationshipResponse(string Id, string Label, string FromEntity,
    string ToEntity, string Cardinality);
