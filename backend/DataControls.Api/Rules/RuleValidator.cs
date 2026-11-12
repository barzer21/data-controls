using System.Globalization;
using System.Text.Json;
using DataControls.Api.Metadata;

namespace DataControls.Api.Rules;

public sealed record RuleValidationError(string Path, string Code, string Message);
public sealed record RuleValidationResult(bool IsValid, IReadOnlyList<RuleValidationError> Errors);

public sealed class RuleValidator(IMetadataProvider metadata)
{
    public const int MaxDepth = 8;
    public const int MaxNodes = 100;
    public const int MaxRelationshipPath = 4;
    public const int MaxTextLength = 4000;

    public RuleValidationResult Validate(RuleDefinition rule) => new Validation(metadata.Catalog).Run(rule);

    // All mutable traversal state belongs to one validation, so the service can be shared.
    private sealed class Validation(MetadataCatalog catalog)
    {
        private readonly Dictionary<string, MetadataEntity> entities =
            catalog.Entities.ToDictionary(e => e.Id, StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, MetadataRelationship> relationships =
            catalog.Relationships.ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        private readonly List<RuleValidationError> errors = [];
        private int nodeCount;

        public RuleValidationResult Run(RuleDefinition rule)
        {
            if (string.IsNullOrWhiteSpace(rule.Name) || rule.Name.Length > 200)
                Error("name", "invalidName", "יש להזין שם בקרה באורך של עד 200 תווים.");
            if (rule.Description?.Length > 2000)
                Error("description", "descriptionTooLong", "תיאור הבקרה מוגבל ל־2,000 תווים.");
            MetadataEntity? root = null;
            if (string.IsNullOrWhiteSpace(rule.RootEntityId) || !entities.TryGetValue(rule.RootEntityId, out root))
                Error("rootEntityId", "unknownEntity", "יש לבחור ישות קיימת מתוך קטלוג הנתונים.");
            if (root is not null)
                Visit(rule.Condition, root, "condition", 1);
            else if (rule.Condition is null)
                Error("condition", "requiredCondition", "יש להגדיר תנאי לבקרה.");
            return new(errors.Count == 0, errors.ToArray());
        }

        private void Visit(RuleCondition? condition, MetadataEntity root, string path, int depth)
        {
            if (++nodeCount > MaxNodes)
            {
                Error(path, "tooManyNodes", $"בקרה מוגבלת ל־{MaxNodes} צמתים בעץ התנאים.");
                return;
            }
            if (depth > MaxDepth)
            {
                Error(path, "tooDeep", $"עומק עץ התנאים מוגבל ל־{MaxDepth} רמות.");
                return;
            }
            switch (condition)
            {
                case RuleGroup group:
                    if (group.Operator is not ("and" or "or"))
                        Error(path + ".operator", "invalidGroupOperator", "קבוצת תנאים חייבת להשתמש ב־and או or.");
                    if (group.Children is not { Count: > 0 })
                    {
                        Error(path + ".children", "emptyGroup", "קבוצה חייבת להכיל לפחות תנאי אחד.");
                        return;
                    }
                    for (var i = 0; i < group.Children.Count; i++)
                    {
                        Visit(group.Children[i], root, $"{path}.children[{i}]", depth + 1);
                        if (nodeCount > MaxNodes) break;
                    }
                    break;
                case RuleComparison comparison:
                    Compare(comparison, root, path);
                    break;
                default:
                    Error(path, "requiredCondition", "יש להגדיר תנאי לבקרה.");
                    break;
            }
        }

        private void Compare(RuleComparison comparison, MetadataEntity root, string path)
        {
            var left = Resolve(comparison.Left, root, path + ".left");
            var op = comparison.Operator;
            if (op is "isNull" or "isNotNull")
            {
                if (comparison.Right is not null)
                    Error(path + ".right", "unexpectedOperand", "בדיקת ערך חסר אינה מקבלת צד ימין.");
                return;
            }
            if (op is not ("equals" or "notEquals" or "greaterThan" or "greaterThanOrEqual"
                or "lessThan" or "lessThanOrEqual"))
                Error(path + ".operator", "unknownOperator", "אופרטור ההשוואה אינו נתמך.");
            else if (left is not null && op is not ("equals" or "notEquals")
                && left.Type is not ("number" or "date"))
                Error(path + ".operator", "operatorTypeMismatch", "השוואת סדר מותרת רק למספרים ולתאריכים.");

            switch (comparison.Right)
            {
                case FieldOperand operand:
                    var right = Resolve(operand.Field, root, path + ".right.field");
                    if (left is not null && right is not null && left.Type != right.Type)
                        Error(path + ".right.field", "fieldTypeMismatch", "ניתן להשוות רק שדות בעלי אותו סוג נתון.");
                    break;
                case ConstantOperand constant:
                    if (constant.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
                        Error(path + ".right.value", "nullRequiresOperator", "לבדיקת ערך חסר יש להשתמש ב־isNull או isNotNull.");
                    else if (left is not null)
                        ValidateConstant(constant.Value, left.Type, path + ".right.value");
                    break;
                default:
                    Error(path + ".right", "requiredOperand", "יש לספק ערך או שדה להשוואה.");
                    break;
            }
        }

        private MetadataField? Resolve(FieldReference? reference, MetadataEntity root, string path)
        {
            if (reference is null)
            {
                Error(path, "requiredField", "יש לבחור שדה להשוואה.");
                return null;
            }
            var entity = root;
            if (reference.RelationshipPath is { } relationshipPath)
            {
                if (relationshipPath.Count > MaxRelationshipPath)
                {
                    Error(path + ".relationshipPath", "pathTooLong", $"מסלול מוגבל ל־{MaxRelationshipPath} קשרים.");
                    return null;
                }
                for (var i = 0; i < relationshipPath.Count; i++)
                {
                    var id = relationshipPath[i];
                    if (string.IsNullOrWhiteSpace(id) || !relationships.TryGetValue(id, out var relationship))
                    {
                        Error($"{path}.relationshipPath[{i}]", "unknownRelationship", "הקשר אינו קיים בקטלוג הנתונים.");
                        return null;
                    }
                    if (!string.Equals(relationship.FromEntity, entity.Id, StringComparison.OrdinalIgnoreCase))
                    {
                        Error($"{path}.relationshipPath[{i}]", "invalidRelationshipDirection", "הקשר אינו יוצא מהישות הנוכחית במסלול.");
                        return null;
                    }
                    entity = entities[relationship.ToEntity];
                }
            }
            var field = entity.Fields.FirstOrDefault(f => string.Equals(f.Id, reference.FieldId,
                StringComparison.OrdinalIgnoreCase));
            if (field is null)
                Error(path + ".fieldId", "unknownField", "השדה אינו קיים בישות שנבחרה בקטלוג הנתונים.");
            return field;
        }

        private void ValidateConstant(JsonElement value, string type, string path)
        {
            var valid = type switch
            {
                "text" => value.ValueKind == JsonValueKind.String && value.GetString()!.Length <= MaxTextLength,
                "number" => value.ValueKind == JsonValueKind.Number && value.TryGetDecimal(out _),
                "boolean" => value.ValueKind is JsonValueKind.True or JsonValueKind.False,
                "date" => value.ValueKind == JsonValueKind.String && DateOnly.TryParseExact(value.GetString(),
                    "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
                _ => false
            };
            if (!valid)
            {
                var message = type switch
                {
                    "text" => $"יש להזין טקסט באורך של עד {MaxTextLength} תווים.",
                    "number" => "יש להזין מספר בטווח הנתמך על ידי decimal, ללא מרכאות.",
                    "boolean" => "יש להזין true או false ללא מרכאות.",
                    "date" => "יש להזין תאריך תקין בפורמט yyyy-MM-dd.",
                    _ => "סוג הערך אינו נתמך."
                };
                Error(path, "constantTypeMismatch", message);
            }
        }

        private void Error(string path, string code, string message) => errors.Add(new(path, code, message));
    }
}
