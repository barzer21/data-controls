using System.Text.Json;
using System.Text.Json.Serialization;

namespace DataControls.Api.Metadata;

public sealed class JsonMetadataProvider : IMetadataProvider
{
    public MetadataCatalog Catalog { get; }

    public JsonMetadataProvider(IWebHostEnvironment environment)
    {
        var path = Path.Combine(environment.ContentRootPath, "Metadata", "metadata.json");
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
            RespectRequiredConstructorParameters = true
        };
        using var stream = File.OpenRead(path);
        Catalog = JsonSerializer.Deserialize<MetadataCatalog>(stream, options)
            ?? throw new InvalidOperationException("Metadata catalog must not be null.");
        MetadataValidator.Validate(Catalog);
    }
}
