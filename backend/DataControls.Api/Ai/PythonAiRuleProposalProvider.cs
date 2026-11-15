using System.Text.Json;
using DataControls.Api.Contracts;
using DataControls.Api.Metadata;
using DataControls.Api.Rules;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace DataControls.Api.Ai;

public sealed class PythonAiRuleProposalProvider(
    HttpClient http,
    IMetadataProvider metadata,
    RuleValidator validator,
    IOptions<JsonOptions> jsonOptions) : IAiRuleProposalProvider
{
    public async Task<AiRuleProposalResult> ProposeAsync(string description, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var request = new
        {
            description,
            metadata = MetadataResponse.FromCatalog(metadata.Catalog)
        };

        using var response = await http.PostAsJsonAsync("proposals", request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var definition = await response.Content.ReadFromJsonAsync<RuleDefinition>(
            jsonOptions.Value.JsonSerializerOptions, cancellationToken)
            ?? throw new JsonException("The AI service returned an empty proposal.");

        // AI output passes the same validation as a manually authored rule.
        return new(definition, validator.Validate(definition));
    }
}
