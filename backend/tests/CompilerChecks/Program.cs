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
Check(!compiler.Compile(Rule(Compare("Employees.DepartmentId", "equals", Constant(1)))).Validation.IsValid, "rejectPhysicalField");
Check(compiler.Compile(Rule(Compare("salary", "drop", Constant(1)))).Query is null, "rejectOperatorBeforeSql");

var projectionRule = Rule(Compare("salary", "greaterThan", Constant(100)));
query = compiler.Compile(projectionRule).Query!;
Check(query.Columns.Count == 9 && query.Columns.Any(c => c.Id == "departmentId") &&
    query.Columns[^1].Id == "employeeDepartment.name", "fullEmployeeAndDepartmentName");
Check(query.Sql.Contains("[t1].[Name] AS [c8]") && query.Sql.Split("LEFT JOIN").Length == 2,
    "catalogRelatedFieldAddsJoinWithoutCondition");
Check(query.Columns[^1].Label.Contains("מחלקת העובד") && query.Columns[^1].Label.Contains("שם המחלקה"), "relatedBusinessLabel");
void InvalidMetadata(MetadataRelatedColumn reference, string name)
{
    var changed = catalog with { Entities = [catalog.Entities[0] with { RelatedColumns = [reference] }, catalog.Entities[1]] };
    try { MetadataValidator.Validate(changed); Check(false, name); }
    catch (InvalidOperationException) { Check(true, name); }
}
MetadataValidator.Validate(catalog);
Check(true, "fixedResultCatalogValidates");
InvalidMetadata(new("name", ["unknown"]), "rejectUnknownConfiguredResultPath");
InvalidMetadata(new("Nonexistent", ["employeeDepartment"]), "rejectUnknownConfiguredResultField");
InvalidMetadata(new("name", []), "rejectEmptyConfiguredResultPath");

// Another entity/table is a data change, not a new compiler branch. Include ] to verify quoting.
var other = catalog.Entities[0] with { Id = "account", Schema = "finance", Table = "Led]ger",
    KeyColumn = "EntryId", Fields = [new("amount", "סכום", "Val]ue", "number")], RelatedColumns = null };
var otherProvider = new TestMetadata(new(1, [other], []));
query = new RuleSqlCompiler(otherProvider, new RuleValidator(otherProvider)).Compile(
    new("Other", null, "account", Compare("amount", "lessThanOrEqual", Constant(10)))).Query!;
Check(query.Sql.Contains("[finance].[Led]]ger]") && query.Sql.Contains("[Val]]ue] <= @p0"), "genericEntityAndEscapedIdentifiers");

var explanations = new RuleExplanationService();
object?[] EvidenceFor(CompiledRule compiled, IReadOnlyDictionary<string, object?> values, params string[] falsePaths)
{
    var evidence = new object?[compiled.EvidenceColumnCount];
    void Visit(CompiledExplanationNode node)
    {
        evidence[node.MatchIndex] = falsePaths.Contains(node.Path) ? 0 : 1;
        foreach (var operand in new[] { node.Left, node.Right })
            if (operand?.ValueIndex is int index) evidence[index] = values[operand.FieldId!];
        foreach (var child in node.Children) Visit(child);
    }
    Visit(compiled.Explanation);
    return evidence;
}
query = compiler.Compile(Rule(Compare("salary", "greaterThan", Constant(15000)))).Query!;
var reason = explanations.Explain(query.Explanation, EvidenceFor(query, new Dictionary<string, object?> { ["salary"] = 18000m }));
Check(reason.FailureReason == "התנאי שהתקיים:\n• שכר: גדול מ־15,000. הערך שנמצא: 18,000.", "readableHebrewNumericReason");
Check(query.Sql.Contains("CASE WHEN ([t0].[Salary] > @p0) THEN 1 ELSE 0 END") &&
    query.Parameters.Count == 1, "sqlTruthAndWhereShareParameterizedPredicate");
Check(reason.Explanation.Left!.Value is decimal && Equals(reason.Explanation.Right!.Value, 15000m), "structuredActualAndExpected");
query = compiler.Compile(Rule(Compare("isActive", "equals", Constant(false), "employeeDepartment"))).Query!;
reason = explanations.Explain(query.Explanation, EvidenceFor(query,
    new Dictionary<string, object?> { ["employeeDepartment.isActive"] = false }));
Check(reason.Explanation.Message == "מחלקת העובד ← מחלקה פעילה: לא.", "readableBooleanReason");
query = compiler.Compile(Rule(Compare("startDate", "isNull"))).Query!;
reason = explanations.Explain(query.Explanation, EvidenceFor(query, new Dictionary<string, object?> { ["startDate"] = null }));
Check(reason.Explanation.Left!.Value is null && reason.Explanation.Message == "תחילת העסקה: ערך חסר.", "explicitMissingValueReason");
query = compiler.Compile(Rule(Compare("endDate", "lessThan", new FieldOperand(new("startDate"))))).Query!;
reason = explanations.Explain(query.Explanation, EvidenceFor(query, new Dictionary<string, object?> {
    ["endDate"] = new DateTime(2024, 1, 1), ["startDate"] = new DateTime(2024, 1, 2)
}));
Check(reason.Explanation.Left!.Value is DateOnly && reason.Explanation.Message.Contains("מוקדם מהערך בשדה \"תחילת העסקה\"") &&
    reason.Explanation.Message.Contains("01/01/2024 מול 02/01/2024"), "fieldDateReasonAndCalendarValues");

query = compiler.Compile(Rule(new RuleGroup("or", [
    new RuleGroup("and", [Compare("isActive", "equals", Constant(true)), Compare("salary", "greaterThan", Constant(1000000))]),
    Compare("firstName", "equals", Constant("Noam"))]))).Query!;
reason = explanations.Explain(query.Explanation, EvidenceFor(query, new Dictionary<string, object?> {
    ["isActive"] = true, ["salary"] = 17200m, ["firstName"] = "Noam"
}, "condition.children[0]", "condition.children[0].children[1]"));
Check(reason.Explanation.Children.Count == 1 && reason.Explanation.Children[0].Path == "condition.children[1]",
    "excludeTrueLeafInsideFailedAndBranch");
Check(!reason.FailureReason.Contains("עובד פעיל") && reason.FailureReason.Contains("לפחות אחד"), "orReasonOnlyExplainsContributingBranches");
query = compiler.Compile(Rule(Compare("firstName", "equals", Constant("Dana")))).Query!;
reason = explanations.Explain(query.Explanation, EvidenceFor(query, new Dictionary<string, object?> { ["firstName"] = "DANA " }));
Check(reason.Explanation.Message.Contains("DANA ") && reason.Explanation.Right!.Value is string,
    "sqlTruthIsNotReevaluatedWithDotNetStringEquality");

var searchableRule = Rule(Compare("isActive", "isNotNull"));
var plain = compiler.Compile(searchableRule).Query!;
var options = new RuleExecutionOptions(" %_[~ ", Compare("salary", "greaterThan", Constant(15000)));
query = compiler.Compile(searchableRule, options).Query!;
Check(query.Sql.Contains("LIKE @p1 ESCAPE N'~'") && query.Sql.Contains("[t1].[Name] LIKE @p1") &&
    !query.Sql.Contains("[t0].[Salary] LIKE"), "searchOnlyProjectedTextFields");
Check(Equals(query.Parameters[1].Value, "%~%~_~[~~%") && query.Parameters[0].Type == SqlDbType.Decimal,
    "literalLikeEscapingAndTypedFilterParameter");
Check(query.Parameters.Select(p => p.Name).Distinct().Count() == query.Parameters.Count &&
    query.Sql.Contains("WHERE ([t0].[IsActive] IS NOT NULL) AND ([t0].[Salary] > @p0) AND ("),
    "filterAndSearchIntersectOriginalCondition");
Check(query.EvidenceColumnCount == plain.EvidenceColumnCount &&
    JsonSerializer.Serialize(query.Explanation) == JsonSerializer.Serialize(plain.Explanation), "optionsNeverBecomeFailureExplanation");
Check(compiler.Compile(searchableRule, new("   ")).Query!.Sql == plain.Sql, "blankSearchIgnored");
Check(compiler.Compile(searchableRule, new(new string('x', 201))).Validation.Errors.Any(e =>
    e.Path == "options.search" && e.Code == "searchTooLong"), "searchLengthValidation");
Check(!new RuleSqlCompiler(otherProvider, new RuleValidator(otherProvider)).Compile(
    new("Numeric", null, "account", Compare("amount", "isNotNull")), new("Noam")).Validation.IsValid,
    "searchNeedsDisplayedTextField");
Check(compiler.Compile(searchableRule, new(Filter: Compare("isActive", "equals", Constant(true), "employeeDepartment")))
    .Validation.Errors.Any(e => e.Code == "filterFieldNotDisplayed"), "filterCannotUseUnreturnedRelatedField");
Check(compiler.Compile(searchableRule, new(Filter: Compare("missing", "equals", Constant(1))))
    .Validation.Errors.Any(e => e.Path == "options.filter.left.fieldId" && e.Code == "unknownField"), "filterValidationPaths");
Check(compiler.Compile(searchableRule, new(Filter: Compare("salary", "equals", Constant("15000"))))
    .Query is null, "filterUsesOriginalTypeValidation");
var nestedOptions = new RuleExecutionOptions(Filter: new RuleGroup("or", [
    Compare("salary", "greaterThan", Constant(20000)),
    Compare("name", "equals", Constant("Sales"), "employeeDepartment")]));
query = compiler.Compile(searchableRule, nestedOptions).Query!;
Check(query.Sql.Contains(" OR ") && query.Sql.Split("LEFT JOIN").Length == 2 && query.EvidenceColumnCount == plain.EvidenceColumnCount,
    "nestedRelatedFilterReusesJoinWithoutExplanationEvidence");
Console.WriteLine($"All {count} compiler checks passed without SQL execution.");

sealed class TestMetadata(MetadataCatalog catalog) : IMetadataProvider
{
    public MetadataCatalog Catalog => catalog;
}
