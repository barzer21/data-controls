using System.Data;
using System.Text.Json;
using DataControls.Api.Metadata;
using DataControls.Api.Rules;

var catalogPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory,
    "../../../../../DataControls.Api/Metadata/metadata.json"));
var catalog = JsonSerializer.Deserialize<MetadataCatalog>(File.ReadAllText(catalogPath),
    new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
var provider = new TestMetadata(catalog);
var compiler = new RuleSqlCompiler(provider, new RuleValidator(provider));
var count = 0;
void Check(bool condition, string name)
{
    if (!condition) throw new Exception(name);
    count++;
    Console.WriteLine($"PASS {name}");
}
RuleComparison Compare(string field, string op, RuleOperand? right = null, params string[] path) =>
    new(new(field, path), op, right);
ConstantOperand Constant(object value) => new(JsonSerializer.SerializeToElement(value));
RuleDefinition Rule(RuleCondition condition) => new("Test", null, "employee", condition);

var malicious = "'; DROP TABLE Employees;--";
var query = compiler.Compile(Rule(Compare("firstName", "equals", Constant(malicious)))).Query!;
Check(!query.Sql.Contains(malicious) && query.Sql.Contains("@p0") && Equals(query.Parameters[0].Value, malicious), "textIsParameter");
Check(query.Parameters[0].Type == SqlDbType.NVarChar, "typedText");
Check(query.Sql.StartsWith("SELECT TOP (@__limit)") && query.Sql.Contains("COUNT_BIG(*) OVER()"), "boundedRowsWithExactCount");
Check(query.Columns.Any(c => c.Id == "salary" && c.Label == "שכר"), "businessColumns");

query = compiler.Compile(Rule(new RuleGroup("and", [
    Compare("salary", "greaterThan", Constant(15000.25m)),
    new RuleGroup("or", [Compare("isActive", "equals", Constant(true)), Compare("startDate", "isNull")])]))).Query!;
Check(query.Sql.Contains(" AND (") && query.Sql.Contains(" OR "), "groupParentheses");
Check(query.Parameters[0].Type == SqlDbType.Decimal && query.Parameters[0].Scale == 2, "decimalScale");
Check(query.Parameters[1].Type == SqlDbType.Bit, "booleanParameter");

query = compiler.Compile(Rule(Compare("endDate", "lessThan", new FieldOperand(new("startDate"))))).Query!;
Check(query.Sql.Contains("CONVERT(date, [t0].[EndDate]) < CONVERT(date, [t0].[StartDate])"), "dateFieldComparison");
query = compiler.Compile(Rule(Compare("birthDate", "equals", Constant("2024-02-29")))).Query!;
Check(query.Parameters[0].Type == SqlDbType.Date && query.Sql.Contains("CONVERT(date, [t0].[BirthDate]) = @p0"), "dateConstantComparison");
query = compiler.Compile(Rule(Compare("salary", "notEquals", Constant(1)))).Query!;
Check(query.Sql.Contains("[Salary] <> @p0") && !query.Sql.Contains("COALESCE"), "sqlNullSemantics");

query = compiler.Compile(Rule(new RuleGroup("and", [
    Compare("isActive", "equals", new FieldOperand(new("isActive", ["EMPLOYEEDEPARTMENT"])), "employeeDepartment"),
    Compare("managerName", "isNull", null, "employeeDepartment")]))).Query!;
Check(query.Sql.Split("LEFT JOIN").Length == 2 && !query.Sql.Contains("INNER JOIN"), "reuseJoinForBothOperands");
Check(query.Sql.Contains("[t1].[ManagerName] IS NULL"), "relatedNullCheck");
Check(!compiler.Compile(Rule(Compare("DepartmentId", "equals", Constant(1)))).Validation.IsValid, "rejectPhysicalField");
Check(compiler.Compile(Rule(Compare("salary", "drop", Constant(1)))).Query is null, "rejectOperatorBeforeSql");

var projectionRule = Rule(Compare("salary", "greaterThan", Constant(100))) with
{
    ResultFields = [new("firstName"), new("name", ["EMPLOYEEDEPARTMENT"])]
};
query = compiler.Compile(projectionRule).Query!;
Check(query.Columns.Count == 2 && query.Columns[0].Id == "firstName" &&
    query.Columns[1].Id == "employeeDepartment.name", "selectedColumnsAndCanonicalPathIds");
Check(query.Sql.Contains("[t1].[Name] AS [c1]") && query.Sql.Split("LEFT JOIN").Length == 2,
    "displayOnlyRelatedFieldAddsJoin");
Check(query.Columns[1].Label.Contains("מחלקת העובד") && query.Columns[1].Label.Contains("שם המחלקה"), "relatedBusinessLabel");
Check(!query.Sql.Contains("[Salary] AS") && query.Sql.Contains("[Salary] > @p0"), "selectionDoesNotChangePredicate");
Check(!compiler.Compile(projectionRule with { ResultFields = [] }).Validation.IsValid, "rejectEmptyResultFields");
Check(!compiler.Compile(projectionRule with { ResultFields = [null] }).Validation.IsValid, "rejectNullResultField");
Check(!compiler.Compile(projectionRule with { ResultFields = [new("salary"), new("SALARY", [])] }).Validation.IsValid, "rejectDuplicateResultFields");
Check(!compiler.Compile(projectionRule with { ResultFields = [new("name", ["unknown"])] }).Validation.IsValid, "rejectUnknownResultPath");
Check(!compiler.Compile(projectionRule with { ResultFields = [new("Nonexistent")] }).Validation.IsValid, "rejectUnknownResultField");
Check(!compiler.Compile(projectionRule with { ResultFields = Enumerable.Repeat<FieldReference?>(new("salary"), 51).ToArray() }).Validation.IsValid, "resultFieldCountLimit");

// Another entity/table is a data change, not a new compiler branch. Include ] to verify quoting.
var other = catalog.Entities[0] with { Id = "account", Schema = "finance", Table = "Led]ger",
    KeyColumn = "EntryId", Fields = [new("amount", "סכום", "Val]ue", "number")] };
var otherProvider = new TestMetadata(new(1, [other], []));
query = new RuleSqlCompiler(otherProvider, new RuleValidator(otherProvider)).Compile(
    new("Other", null, "account", Compare("amount", "lessThanOrEqual", Constant(10)))).Query!;
Check(query.Sql.Contains("[finance].[Led]]ger]") && query.Sql.Contains("[Val]]ue] <= @p0"), "genericEntityAndEscapedIdentifiers");
Console.WriteLine($"All {count} compiler checks passed without SQL execution.");

sealed class TestMetadata(MetadataCatalog catalog) : IMetadataProvider
{
    public MetadataCatalog Catalog => catalog;
}
