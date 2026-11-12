using System.Data;
using System.Globalization;
using DataControls.Api.Metadata;

namespace DataControls.Api.Rules;

public sealed record RuleSqlParameter(string Name, SqlDbType Type, object Value, byte Scale = 0);
public sealed record RuleResultColumn(string Id, string Label, string Type);
public sealed record CompiledRule(string Sql, IReadOnlyList<RuleSqlParameter> Parameters,
    IReadOnlyList<RuleResultColumn> Columns);
public sealed record RuleCompilationResult(RuleValidationResult Validation, CompiledRule? Query);

public sealed class RuleSqlCompiler(IMetadataProvider metadata, RuleValidator validator)
{
    public RuleCompilationResult Compile(RuleDefinition definition)
    {
        var validation = validator.Validate(definition);
        return new(validation, validation.IsValid ? new Compilation(metadata.Catalog, definition).Build() : null);
    }

    // Every compilation owns its aliases/parameters. No SQL fragment comes from a request.
    private sealed class Compilation(MetadataCatalog catalog, RuleDefinition definition)
    {
        private readonly Dictionary<string, MetadataEntity> entities =
            catalog.Entities.ToDictionary(e => e.Id, StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, MetadataRelationship> relationships =
            catalog.Relationships.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<(string, string), string> aliases = [];
        private readonly List<string> joins = [];
        private readonly List<RuleSqlParameter> parameters = [];

        public CompiledRule Build()
        {
            var root = entities[definition.RootEntityId!];
            var predicate = Condition(definition.Condition!);
            var references = definition.ResultFields ?? root.Fields.Select(f => new FieldReference(f.Id)).ToArray();
            // Resolve projections before rendering FROM, because a display-only field can add a join.
            var projections = references.Select(reference => Projection(reference!)).ToArray();
            var fields = projections.Select((projection, index) => $"{projection.Sql} AS [c{index}]");
            var sql = $"SELECT TOP (@__limit) COUNT_BIG(*) OVER() AS [__count], " +
                $"[t0].{Quote(root.KeyColumn)} AS [__id], {string.Join(", ", fields)} " +
                $"FROM {Table(root)} AS [t0] {string.Join(" ", joins)} " +
                $"WHERE {predicate} ORDER BY [t0].{Quote(root.KeyColumn)};";
            return new(sql, parameters.ToArray(), projections.Select(p => p.Column).ToArray());
        }

        private (string Sql, RuleResultColumn Column) Projection(FieldReference reference)
        {
            var (sql, field) = Field(reference);
            var path = (reference.RelationshipPath ?? []).Select(id => relationships[id!]).ToArray();
            var key = string.Join(".", path.Select(r => r.Id).Append(field.Id));
            var label = string.Join(" ← ", path.Select(r => r.Label).Append(field.Label));
            return (sql, new(key, label, field.Type));
        }

        private string Condition(RuleCondition condition) => condition switch
        {
            RuleGroup group => "(" + string.Join(group.Operator == "and" ? " AND " : " OR ",
                group.Children!.Select(child => Condition(child!))) + ")",
            RuleComparison comparison => Comparison(comparison),
            _ => throw new InvalidOperationException("Only validated condition nodes can be compiled.")
        };

        private string Comparison(RuleComparison comparison)
        {
            var (left, field) = Field(comparison.Left!);
            if (comparison.Operator == "isNull") return $"({left} IS NULL)";
            if (comparison.Operator == "isNotNull") return $"({left} IS NOT NULL)";
            var op = comparison.Operator switch
            {
                "equals" => "=", "notEquals" => "<>", "greaterThan" => ">",
                "greaterThanOrEqual" => ">=", "lessThan" => "<", "lessThanOrEqual" => "<=",
                _ => throw new InvalidOperationException("Only validated operators can be compiled.")
            };
            var right = comparison.Right switch
            {
                FieldOperand operand => Field(operand.Field!).Sql,
                ConstantOperand constant => Parameter(constant, field.Type),
                _ => throw new InvalidOperationException("Only validated operands can be compiled.")
            };
            return $"({left} {op} {right})";
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
