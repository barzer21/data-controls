namespace DataControls.Api.Metadata;

public sealed record MetadataCatalog(int Version, IReadOnlyList<MetadataEntity> Entities,
    IReadOnlyList<MetadataRelationship> Relationships);

public sealed record MetadataEntity(string Id, string Label, string Schema, string Table,
    string KeyColumn, IReadOnlyList<MetadataField> Fields,
    IReadOnlyList<MetadataRelatedColumn>? RelatedColumns = null);

public sealed record MetadataRelatedColumn(string FieldId, IReadOnlyList<string> RelationshipPath);

public sealed record MetadataField(string Id, string Label, string Column, string Type);

public sealed record MetadataRelationship(string Id, string Label, string FromEntity,
    string FromColumn, string ToEntity, string ToColumn, string Cardinality);
