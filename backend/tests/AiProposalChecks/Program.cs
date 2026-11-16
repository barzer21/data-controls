using System.Net;
using System.Text;
using System.Text.Json;
using DataControls.Api.Ai;
using DataControls.Api.Metadata;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using DataControls.Api.Rules;

var contractOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    AllowOutOfOrderMetadataProperties = true
};
using (var fixtures = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "rule-contract.json"))))
{
    var validator = new RuleValidator(new ContractMetadata());
    foreach (var fixture in fixtures.RootElement.EnumerateArray())
    {
        bool accepted;
        try
        {
            var definition = fixture.GetProperty("definition").Deserialize<RuleDefinition>(contractOptions);
            accepted = definition is not null && validator.Validate(definition).IsValid;
        }
        catch (JsonException) { accepted = false; }
        Check(accepted == fixture.GetProperty("valid").GetBoolean(), fixture.GetProperty("name").GetString()!);
    }
    Console.WriteLine($"PASS: {fixtures.RootElement.GetArrayLength()} shared Python/.NET contract cases.");
}

const string valid = """
    {"name":"Salary check","description":"Mock","rootEntityId":"employee",
     "condition":{"left":{"fieldId":"salary"},"operator":"greaterThan",
       "right":{"value":15000,"kind":"constant"},"kind":"comparison"}}
    """;

var metadata = new SampleMetadata();
var options = new JsonOptions();
options.JsonSerializerOptions.AllowOutOfOrderMetadataProperties = true;
var requestCount = 0;

async Task<DataControls.Api.Ai.AiRuleProposalResult> Propose(string body,
    HttpStatusCode status = HttpStatusCode.OK, CancellationToken cancellationToken = default)
{
    using var handler = new StubHandler(async (request, token) =>
    {
        requestCount++;
        Check(request.Method == HttpMethod.Post, "POST method");
        Check(request.RequestUri!.AbsoluteUri == "http://127.0.0.1:8000/proposals", "proposal URL");
        using var payload = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(token));
        Check(payload.RootElement.GetProperty("description").GetString() == "Salary request", "description");
        var catalog = payload.RootElement.GetProperty("metadata");
        Check(catalog.GetProperty("version").GetInt32() == 1, "metadata version");
        var entity = catalog.GetProperty("entities")[0];
        Check(entity.GetProperty("fields")[0].GetProperty("id").GetString() == "salary", "business fields");
        Check(!entity.TryGetProperty("schema", out _) && !entity.TryGetProperty("table", out _)
            && !entity.TryGetProperty("keyColumn", out _), "no technical entity mappings");
        Check(!entity.GetProperty("fields")[0].TryGetProperty("column", out _), "no SQL column mappings");
        return new HttpResponseMessage(status)
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json")
        };
    });
    using var http = new HttpClient(handler) { BaseAddress = new Uri("http://127.0.0.1:8000/") };
    var provider = new PythonAiRuleProposalProvider(http, metadata,
        new DataControls.Api.Rules.RuleValidator(metadata), Options.Create(options));
    return await provider.ProposeAsync("Salary request", cancellationToken);
}

var result = await Propose(valid);
Check(result.Validation.IsValid && result.Definition.Name == "Salary check", "valid proposal and polymorphic JSON");

var invalid = await Propose(valid.Replace("\"fieldId\":\"salary\"", "\"fieldId\":\"unknown\""));
Check(!invalid.Validation.IsValid && invalid.Validation.Errors.Any(e => e.Code == "unknownField"),
    "AI output checked by existing validator");

await Expect<JsonException>(() => Propose("not json"), "malformed response");
await Expect<JsonException>(() => Propose("null"), "null response");
await Expect<HttpRequestException>(() => Propose("{}", HttpStatusCode.BadRequest), "upstream rejection");

using var cancelled = new CancellationTokenSource();
cancelled.Cancel();
await Expect<OperationCanceledException>(() => Propose(valid, cancellationToken: cancelled.Token), "cancellation");

Check(requestCount == 5, "cancelled operation did not send a request");
Console.WriteLine("PASS: business-only request, valid/invalid proposals, polymorphic JSON, malformed/null responses, HTTP error, cancellation.");

static void Check(bool condition, string message)
{
    if (!condition) throw new InvalidOperationException("Failed: " + message);
}

static async Task Expect<T>(Func<Task<DataControls.Api.Ai.AiRuleProposalResult>> action, string message)
    where T : Exception
{
    try { await action(); }
    catch (T) { return; }
    throw new InvalidOperationException("Expected " + typeof(T).Name + ": " + message);
}

sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> send)
    : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken token) =>
        send(request, token);
}

sealed class SampleMetadata : IMetadataProvider
{
    public MetadataCatalog Catalog { get; } = new(1,
        [new MetadataEntity("employee", "Employees", "dbo", "Employees", "Id",
            [new MetadataField("salary", "Salary", "Salary", "number")])], []);
}

sealed class ContractMetadata : IMetadataProvider
{
    public MetadataCatalog Catalog { get; } = new(1,
        [new MetadataEntity("employee", "Employees", "dbo", "Employees", "Id",
            [new MetadataField("salary", "Salary", "Salary", "number"),
             new MetadataField("isActive", "Active", "IsActive", "boolean"),
             new MetadataField("firstName", "First name", "FirstName", "text")])], []);
}
