namespace DataControls.Api.Models;

public sealed class SavedRule
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string RootEntityId { get; set; } = string.Empty;
    public string ConditionJson { get; set; } = string.Empty;
    public string? ResultFieldsJson { get; set; }
    public int DefinitionVersion { get; set; } = 1;
    public DateTimeOffset CreatedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; }
}
