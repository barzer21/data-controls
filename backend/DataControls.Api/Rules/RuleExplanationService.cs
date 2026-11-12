using System.Globalization;

namespace DataControls.Api.Rules;

// Internal plan: indexes refer to hidden SQL columns, never to user-supplied expressions.
public sealed record CompiledExplanationOperand(string Kind, string? FieldId, string? Label,
    string Type, int? ValueIndex, object? ConstantValue);
public sealed record CompiledExplanationNode(string Path, string Kind, string Operator, int MatchIndex,
    CompiledExplanationOperand? Left, CompiledExplanationOperand? Right,
    IReadOnlyList<CompiledExplanationNode> Children);

public sealed record RuleExplanationOperand(string Kind, string? FieldId, string? Label, string Type, object? Value);
public sealed record RuleExplanationNode(string Path, string Kind, string Operator, string Message,
    RuleExplanationOperand? Left, RuleExplanationOperand? Right, IReadOnlyList<RuleExplanationNode> Children);
public sealed record RuleExplanationResult(string FailureReason, RuleExplanationNode Explanation);

public sealed class RuleExplanationService
{
    private static readonly CultureInfo Hebrew = CultureInfo.GetCultureInfo("he-IL");

    public RuleExplanationResult Explain(CompiledExplanationNode plan, IReadOnlyList<object?> evidence)
    {
        var root = Build(plan, evidence)
            ?? throw new InvalidOperationException("A violating row must satisfy the root condition in SQL.");
        var lines = new List<string>();
        if (root.Kind == "comparison") lines.Add("התנאי שהתקיים:");
        Render(root, lines, 0, root.Kind == "comparison");
        return new(string.Join("\n", lines), root);
    }

    private static RuleExplanationNode? Build(CompiledExplanationNode plan, IReadOnlyList<object?> evidence)
    {
        // SQL is authoritative, including collation, dates and UNKNOWN. Never re-evaluate here.
        if (!Equals(evidence[plan.MatchIndex], 1)) return null;
        if (plan.Kind == "group")
        {
            var children = plan.Children.Select(child => Build(child, evidence))
                .OfType<RuleExplanationNode>().ToArray();
            return new(plan.Path, plan.Kind, plan.Operator,
                plan.Operator == "and" ? "כל התנאים הבאים התקיימו:" : "לפחות אחד מהתנאים הבאים התקיים:",
                null, null, children);
        }
        var left = Operand(plan.Left!, evidence);
        var right = plan.Right is null ? null : Operand(plan.Right, evidence);
        return new(plan.Path, plan.Kind, plan.Operator, Describe(plan.Operator, left, right), left, right, []);
    }

    private static RuleExplanationOperand Operand(CompiledExplanationOperand operand, IReadOnlyList<object?> evidence)
    {
        var value = operand.ValueIndex is int index ? evidence[index] : operand.ConstantValue;
        if (value is DateTime date && operand.Type == "date") value = DateOnly.FromDateTime(date);
        return new(operand.Kind, operand.FieldId, operand.Label, operand.Type, value);
    }

    private static string Describe(string op, RuleExplanationOperand left, RuleExplanationOperand? right)
    {
        var label = left.Label!;
        var actual = Format(left.Value, left.Type);
        if (op == "isNull") return $"{label}: ערך חסר.";
        if (op == "isNotNull") return $"{label}: ערך קיים. הערך שנמצא: {actual}.";
        if (op == "equals" && left.Type == "boolean" && right!.Kind == "constant")
            return $"{label}: {actual}.";

        if (right!.Kind == "field")
        {
            var relation = left.Type == "date" && op is "greaterThanOrEqual" or "lessThanOrEqual"
                ? $"זהה לערך בשדה \"{right.Label}\" או {(op == "greaterThanOrEqual" ? "מאוחר" : "מוקדם")} ממנו"
                : OperatorPrefix(op, left.Type, false) + $"הערך בשדה \"{right.Label}\"";
            return $"{label}: {relation}. " +
                $"הערכים שנמצאו: {actual} מול {Format(right.Value, right.Type)}.";
        }
        var expected = Format(right.Value, right.Type);
        var comparison = left.Type == "date" && op is "greaterThanOrEqual" or "lessThanOrEqual"
            ? $"זהה לתאריך {expected} או {(op == "greaterThanOrEqual" ? "מאוחר" : "מוקדם")} ממנו"
            : OperatorPrefix(op, left.Type, true) + expected;
        return $"{label}: {comparison}. הערך שנמצא: {actual}.";
    }

    private static string OperatorPrefix(string op, string type, bool literal)
    {
        var suffix = literal ? "־" : "";
        return op switch
        {
            "equals" => "שווה ל" + suffix,
            "notEquals" => "שונה מ" + suffix,
            "greaterThan" => (type == "date" ? "מאוחר מ" : "גדול מ") + suffix,
            "lessThan" => (type == "date" ? "מוקדם מ" : "קטן מ") + suffix,
            "greaterThanOrEqual" => (type == "date" ? "מאוחר או שווה ל" : "גדול או שווה ל") + suffix,
            "lessThanOrEqual" => (type == "date" ? "מוקדם או שווה ל" : "קטן או שווה ל") + suffix,
            _ => throw new InvalidOperationException("Unsupported explanation operator.")
        };
    }

    private static string Format(object? value, string type) => value switch
    {
        null => "חסר",
        bool boolean => boolean ? "כן" : "לא",
        DateOnly date => date.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture),
        IFormattable number when type == "number" => number.ToString("#,0.############################", Hebrew),
        string text => text.Length == 0 ? "טקסט ריק" : "\"" + text.Replace("\r", " ").Replace("\n", " ") + "\"",
        _ => Convert.ToString(value, Hebrew) ?? "חסר"
    };

    private static void Render(RuleExplanationNode node, List<string> lines, int depth, bool bullet)
    {
        lines.Add(new string(' ', depth * 2) + (bullet ? "• " : "") + node.Message);
        foreach (var child in node.Children) Render(child, lines, bullet ? depth + 1 : depth, true);
    }
}
