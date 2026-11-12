using System.Data;
using System.Globalization;
using DataControls.Api.Metadata;

namespace DataControls.Api.Rules;

public sealed record RuleSqlParameter(string Name, SqlDbType Type, object Value, byte Scale = 0);
public sealed record RuleResultColumn(string Id, string Label, string Type);
public sealed record CompiledRule(string Sql, IReadOnlyList<RuleSqlParameter> Parameters,
    IReadOnlyList<RuleResultColumn> Columns, CompiledExplanationNode Explanation, int EvidenceColumnCount);
public sealed record RuleCompilationResult(RuleValidationResult Validation, CompiledRule? Query);

public sealed class RuleSqlCompiler(IMetadataProvider metadata, RuleValidator validator)
{
    public RuleCompilationResult Compile(RuleDefinition definition, RuleExecutionOptions? options = null)
    {
        var validation = validator.Validate(definition);
        if (!validation.IsValid) return new(validation, null);
        options ??= new();
        validation = RuleExecutionOptionsValidator.Validate(definition, options, metadata.Catalog, validator);
        return new(validation, validation.IsValid ? new Compilation(metadata.Catalog, definition, options).Build() : null);
    }

    // Every compilation owns its aliases/parameters. No SQL fragment comes from a request.
    private sealed class Compilation(MetadataCatalog catalog, RuleDefinition definition, RuleExecutionOptions options)
    {
        private readonly Dictionary<string, MetadataEntity> entities =
            catalog.Entities.ToDictionary(e => e.Id, StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, MetadataRelationship> relationships =
            catalog.Relationships.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<(string, string), string> aliases = [];
        private readonly List<string> joins = [];
        private readonly List<RuleSqlParameter> parameters = [];
        private readonly List<string> evidenceColumns = [];

        public CompiledRule Build()
        {
            var root = entities[definition.RootEntityId!];
            var condition = Condition(definition.Condition!, "condition");
            var references = RuleResultSchema.Fields(catalog, root.Id);
            // Resolve projections before rendering FROM, because a display-only field can add a join.
            var projections = references.Select(reference => Projection(reference!)).ToArray();
            var predicates = new List<string> { condition.Sql };
            if (options.Filter is not null)
                predicates.Add(Condition(options.Filter, "options.filter", false).Sql);
            if (!string.IsNullOrWhiteSpace(options.Search))
            {
                var name = $"@p{parameters.Count}";
                var literal = options.Search.Trim().Replace("~", "~~").Replace("%", "~%")
                    .Replace("_", "~_").Replace("[", "~[");
                parameters.Add(new(name, SqlDbType.NVarChar, "%" + literal + "%"));
                predicates.Add("(" + string.Join(" OR ", projections.Where(p => p.Column.Type == "text")
                    .Select(p => $"{p.Sql} LIKE {name} ESCAPE N'~'")) + ")");
            }
            var fields = projections.Select((projection, index) => $"{projection.Sql} AS [c{index}]");
            var sql = $"SELECT TOP (@__limit) COUNT_BIG(*) OVER() AS [__count], " +
                $"[t0].{Quote(root.KeyColumn)} AS [__id], {string.Join(", ", fields)}, {string.Join(", ", evidenceColumns)} " +
                $"FROM {Table(root)} AS [t0] {string.Join(" ", joins)} " +
                $"WHERE {string.Join(" AND ", predicates)} ORDER BY [t0].{Quote(root.KeyColumn)};";
            return new(sql, parameters.ToArray(), projections.Select(p => p.Column).ToArray(),
                condition.Explanation!, evidenceColumns.Count);
        }

        private (string Sql, RuleResultColumn Column) Projection(FieldReference reference)
        {
            var (sql, field) = Field(reference);
            var path = (reference.RelationshipPath ?? []).Select(id => relationships[id!]).ToArray();
            var key = string.Join(".", path.Select(r => r.Id).Append(field.Id));
            var label = string.Join(" ← ", path.Select(r => r.Label).Append(field.Label));
            return (sql, new(key, label, field.Type));
        }

        private (string Sql, CompiledExplanationNode? Explanation) Condition(RuleCondition condition, string path, bool explain = true)
        {
            if (condition is RuleGroup group)
            {
                var children = group.Children!.Select((child, index) =>
                    Condition(child!, $"{path}.children[{index}]", explain)).ToArray();
                var sql = "(" + string.Join(group.Operator == "and" ? " AND " : " OR ", children.Select(c => c.Sql)) + ")";
                return (sql, explain ? new(path, "group", group.Operator!, Match(sql), null, null,
                    children.Select(c => c.Explanation!).ToArray()) : null);
            }
            if (condition is not RuleComparison comparison)
                throw new InvalidOperationException("Only validated condition nodes can be compiled.");
            var (predicate, left, right) = Comparison(comparison, explain);
            return (predicate, explain ? new(path, "comparison", comparison.Operator!, Match(predicate), left, right, []) : null);
        }

        private int Evidence(string sql)
        {
            var index = evidenceColumns.Count;
            evidenceColumns.Add($"{sql} AS [__e{index}]");
            return index;
        }

        private int Match(string predicate) => Evidence($"CASE WHEN {predicate} THEN 1 ELSE 0 END");

        private CompiledExplanationOperand EvidenceField(FieldReference reference)
        {
            var projection = Projection(reference);
            return new("field", projection.Column.Id, projection.Column.Label,
                projection.Column.Type, Evidence(projection.Sql), null);
        }

        private (string Sql, CompiledExplanationOperand? Left, CompiledExplanationOperand? Right) Comparison(RuleComparison comparison, bool explain)
        {
            var (left, field) = Field(comparison.Left!);
            var leftEvidence = explain ? EvidenceField(comparison.Left!) : null;
            if (comparison.Operator == "isNull") return ($"({left} IS NULL)", leftEvidence, null);
            if (comparison.Operator == "isNotNull") return ($"({left} IS NOT NULL)", leftEvidence, null);
            var op = comparison.Operator switch
            {
                "equals" => "=", "notEquals" => "<>", "greaterThan" => ">",
                "greaterThanOrEqual" => ">=", "lessThan" => "<", "lessThanOrEqual" => "<=",
                _ => throw new InvalidOperationException("Only validated operators can be compiled.")
            };
            string right;
            CompiledExplanationOperand? rightEvidence;
            if (comparison.Right is FieldOperand operand)
            {
                right = Field(operand.Field!).Sql;
                rightEvidence = explain ? EvidenceField(operand.Field!) : null;
            }
            else if (comparison.Right is ConstantOperand constant)
            {
                right = Parameter(constant, field.Type);
                rightEvidence = explain ? new("constant", null, null, field.Type, null, parameters[^1].Value) : null;
            }
            else throw new InvalidOperationException("Only validated operands can be compiled.");
            return ($"({left} {op} {right})", leftEvidence, rightEvidence);
        }

        private (string Sql, MetadataField Field) Field(FieldReference reference)
        {
            var entity = entities[definition.RootEntityId!];
            var alias = "t0";
            foreach (var id in reference.RelationshipPath ?? [])
            {
                var relationship = relationships[id!];
                var target = entities[relationship.ToEntity];
                var key = (alias, relationship.Id);
                if (!aliases.TryGetValue(key, out var targetAlias))
                {
                    targetAlias = $"t{aliases.Count + 1}";
                    aliases.Add(key, targetAlias);
                    joins.Add($"LEFT JOIN {Table(target)} AS {Quote(targetAlias)} ON " +
                        $"{Quote(alias)}.{Quote(relationship.FromColumn)} = {Quote(targetAlias)}.{Quote(relationship.ToColumn)}");
                }
                alias = targetAlias;
                entity = target;
            }
            var field = entity.Fields.Single(f => string.Equals(f.Id, reference.FieldId, StringComparison.OrdinalIgnoreCase));
            return (Column(alias, field), field);
        }

        private string Parameter(ConstantOperand constant, string type)
        {
            var name = $"@p{parameters.Count}";
            var value = constant.Value;
            var parameter = type switch
            {
                "text" => new RuleSqlParameter(name, SqlDbType.NVarChar, value.GetString()!),
                "boolean" => new RuleSqlParameter(name, SqlDbType.Bit, value.GetBoolean()),
                "date" => new RuleSqlParameter(name, SqlDbType.Date,
                    DateOnly.ParseExact(value.GetString()!, "yyyy-MM-dd", CultureInfo.InvariantCulture).ToDateTime(TimeOnly.MinValue)),
                "number" => new RuleSqlParameter(name, SqlDbType.Decimal, value.GetDecimal(),
                    (byte)((decimal.GetBits(value.GetDecimal())[3] >> 16) & 0x7f)),
                _ => throw new InvalidOperationException("Unsupported metadata type.")
            };
            parameters.Add(parameter);
            return name;
        }

        private static string Column(string alias, MetadataField field)
        {
            var column = $"{Quote(alias)}.{Quote(field.Column)}";
            return field.Type == "date" ? $"CONVERT(date, {column})" : column;
        }
        private static string Table(MetadataEntity entity) => $"{Quote(entity.Schema)}.{Quote(entity.Table)}";
        private static string Quote(string identifier) => "[" + identifier.Replace("]", "]]") + "]";
    }
}
