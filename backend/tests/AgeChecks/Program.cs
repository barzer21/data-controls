using System.Data;
using System.Text.Json;
using DataControls.Api.Contracts;
using DataControls.Api.Metadata;
using DataControls.Api.Rules;
using Microsoft.Data.SqlClient;

// Read-only SQL checks: the generated query reads an inline VALUES fixture, not application tables.
var connectionString = Environment.GetEnvironmentVariable("AGE_TEST_CONNECTION")
    ?? "Server=localhost;Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout=5";
var fields = new MetadataField[] {
    new("birthDate", "תאריך לידה", "BirthDate", "date"),
    new("age", "גיל", null, "number", new("age", "birthDate"))
};
var catalog = new MetadataCatalog(1,
    [new("person", "אנשים", "dbo", "AgeFixture", "Id", fields)], []);
MetadataValidator.Validate(catalog);
var count = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new Exception(name);
    count++;
    Console.WriteLine($"PASS {name}");
}
RuleComparison Compare(string field, string op, object? value = null) =>
    new(new(field), op, op is "isNull" or "isNotNull" ? null : new ConstantOperand(JsonSerializer.SerializeToElement(value)));
RuleDefinition Rule(RuleCondition condition) => new("Age check", null, "person", condition);
CompiledRule Compile(DateOnly date, RuleCondition condition, RuleExecutionOptions? options = null)
{
    var provider = new TestMetadata(catalog);
    var result = new RuleSqlCompiler(provider, new RuleValidator(provider), new FixedClock(date))
        .Compile(Rule(condition), options);
    Check(result.Validation.IsValid && result.Query is not null, "compileAgeRule");
    return result.Query!;
}

void Reject(MetadataField age, string name)
{
    var changed = catalog with { Entities = [catalog.Entities[0] with { Fields = [fields[0], age] }] };
    try { MetadataValidator.Validate(changed); }
    catch (InvalidOperationException) { Check(true, name); return; }
    throw new Exception("Invalid calculation accepted: " + name);
}
Reject(fields[1] with { Column = "Age" }, "rejectPhysicalAndCalculatedSource");
Reject(fields[1] with { Calculation = new("arbitrary SQL", "birthDate") }, "rejectUnapprovedCalculation");
Reject(fields[1] with { Calculation = new("age", "missing") }, "rejectMissingSource");
Reject(fields[1] with { Calculation = new("age", "age") }, "rejectCalculatedOrSelfSource");
Reject(fields[1] with { Type = "text" }, "rejectNonNumericAge");
var publicJson = JsonSerializer.Serialize(MetadataResponse.FromCatalog(catalog));
Check(publicJson.Contains("age") && !publicJson.Contains("Calculation") && !publicJson.Contains("BirthDate"), "publicAgeHasNoTechnicalMapping");

await using var connection = new SqlConnection(connectionString);
await connection.OpenAsync();
async Task<ExecutionRows> Execute(CompiledRule query,
    params string?[] births)
{
    await using var command = connection.CreateCommand();
    command.CommandTimeout = 10;
    var rows = births.Select((birth, i) => $"({i + 1}, CONVERT(date, @birth{i}))");
    var source = births.Length == 0
        ? "(SELECT CAST(NULL AS int) AS [Id], CAST(NULL AS date) AS [BirthDate] WHERE 1=0) AS [t0]"
        : $"(VALUES {string.Join(", ", rows)}) AS [t0]([Id], [BirthDate])";
    command.CommandText = query.Sql.Replace("[dbo].[AgeFixture] AS [t0]", source);
    command.Parameters.Add(new SqlParameter("@__limit", SqlDbType.Int) { Value = 100 });
    for (var i = 0; i < births.Length; i++)
        command.Parameters.Add(new SqlParameter($"@birth{i}", SqlDbType.Date) {
            Value = births[i] is { } date ? DateOnly.Parse(date).ToDateTime(TimeOnly.MinValue) : DBNull.Value
        });
    foreach (var p in query.Parameters)
    {
        var parameter = new SqlParameter(p.Name, p.Type) { Value = p.Value };
        if (p.Type == SqlDbType.Decimal) { parameter.Precision = 29; parameter.Scale = p.Scale; }
        command.Parameters.Add(parameter);
    }
    var result = new ExecutionRows();
    await using var reader = await command.ExecuteReaderAsync();
    while (await reader.ReadAsync())
    {
        result.TotalCount = reader.GetInt64(0);
        var evidence = new object?[query.EvidenceColumnCount];
        for (var i = 0; i < evidence.Length; i++)
        {
            var index = 2 + query.Columns.Count + i;
            evidence[i] = reader.IsDBNull(index) ? null : reader.GetValue(index);
        }
        result.Add((reader.GetInt32(1), reader.IsDBNull(3) ? null : reader.GetInt32(3),
            new RuleExplanationService().Explain(query.Explanation, evidence)));
    }
    Check(await reader.NextResultAsync() && await reader.ReadAsync(), "evaluatedCountResultSetExists");
    result.EvaluatedCount = reader.GetInt64(0);
    return result;
}

foreach (var test in new (string Day, string Birth, int Age, string Name)[] {
    (Day: "2026-06-19", Birth: "2000-06-20", Age: 25, Name: "dayBeforeBirthday"),
    ("2026-06-20", "2000-06-20", 26, "birthday"),
    ("2026-06-21", "2000-06-20", 26, "dayAfterBirthday"),
    ("2026-01-01", "2000-12-31", 25, "yearChangeIsNotBirthday"),
    ("2025-02-27", "2000-02-29", 24, "leapBirthdayBeforeFeb28"),
    ("2025-02-28", "2000-02-29", 25, "leapBirthdayOnFeb28InNonLeapYear"),
    ("2024-02-28", "2000-02-29", 23, "leapYearBeforeBirthday"),
    ("2024-02-29", "2000-02-29", 24, "leapYearBirthday"),
    ("2026-06-20", "2026-06-20", 0, "newbornHasAgeZero")
})
{
    var result = await Execute(Compile(DateOnly.Parse(test.Day), Compare("birthDate", "isNotNull")), test.Birth);
    Check(result.Single().Age == test.Age, test.Name);
}

var day = new DateOnly(2026, 6, 20);
var query = Compile(day, Compare("age", "isNull"));
var missing = await Execute(query, null, "2027-01-01", "2000-06-20");
Check(missing.Select(row => row.Id).SequenceEqual([1, 2]) && missing.All(row => row.Age is null), "missingAndFutureBirthDatesHaveNoAge");
Check(missing.All(row => row.Explanation.FailureReason.Contains("גיל: ערך חסר")), "missingAgeExplanation");
query = Compile(day, Compare("age", "greaterThanOrEqual", 26));
var matched = await Execute(query, "2000-06-20", "2000-06-21", "1990-01-01", null);
Check(matched.Select(row => row.Id).SequenceEqual([1, 3]), "ageConditionFiltersBeforeLimit");
Check(matched[0].Explanation.FailureReason.Contains("26") && matched[0].Explanation.Explanation.Left!.Value is int age && age == 26, "ageExplanationUsesComputedSqlEvidence");
query = Compile(day, Compare("birthDate", "isNotNull"), new(Filter: Compare("age", "lessThan", 26)));
matched = await Execute(query, "2000-06-20", "2000-06-21", "1990-01-01", "2027-01-01");
Check(matched.Single().Id == 2 && matched[0].Age == 25, "resultAgeFilterUsesSameComputedValue");
Check(matched.EvaluatedCount == 4 && matched.TotalCount == 1, "rootCountIgnoresRuleAndTemporaryFilter");
Check(!matched[0].Explanation.FailureReason.Contains("גיל"), "temporaryAgeFilterDoesNotChangeFailureReason");
Check(query.Parameters.Count(p => p.Name == "@__asOfDate") == 1 &&
    Equals(query.Parameters.Single(p => p.Name == "@__asOfDate").Value, day.ToDateTime(TimeOnly.MinValue)), "oneTypedDatePerExecution");
var zero = await Execute(Compile(day, Compare("age", "greaterThan", 150)), "2000-06-20", null);
Check(zero.Count == 0 && zero.TotalCount == 0 && zero.EvaluatedCount == 2, "zeroViolationsStillReturnRootCount");
var empty = await Execute(query);
Check(empty.Count == 0 && empty.EvaluatedCount == 0, "emptyEntityReturnsZeroDenominator");
var capped = await Execute(Compile(day, Compare("age", "isNotNull")), Enumerable.Repeat<string?>("2000-06-20", 110).ToArray());
Check(capped.Count == 100 && capped.TotalCount == 110 && capped.EvaluatedCount == 110, "rowLimitDoesNotLimitEitherCount");
Console.WriteLine($"All {count} age checks passed. No tables or records were changed.");

sealed class ExecutionRows : List<(int Id, int? Age, RuleExplanationResult Explanation)>
{
    public long TotalCount { get; set; }
    public long EvaluatedCount { get; set; }
}
sealed class TestMetadata(MetadataCatalog catalog) : IMetadataProvider { public MetadataCatalog Catalog => catalog; }
sealed class FixedClock(DateOnly day) : TimeProvider
{
    public override DateTimeOffset GetUtcNow() => new(day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc));
}
