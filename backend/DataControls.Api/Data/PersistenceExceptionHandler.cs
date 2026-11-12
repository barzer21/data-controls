using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using DataControls.Api.Rules;

namespace DataControls.Api.Data;

public sealed class PersistenceExceptionHandler(ILogger<PersistenceExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not (SqlException or DbUpdateException or RuleExecutionTimeoutException)) return false;
        logger.LogError(exception, "Database operation failed for {Path}", context.Request.Path);
        var conflict = exception is DbUpdateConcurrencyException;
        var timeout = exception is RuleExecutionTimeoutException or SqlException { Number: -2 };
        context.Response.StatusCode = timeout ? StatusCodes.Status504GatewayTimeout
            : conflict ? StatusCodes.Status409Conflict : StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = context.Response.StatusCode,
            Title = timeout ? "הפעולה מול מסד הנתונים חרגה מזמן ההמתנה המותר."
                : conflict ? "הבקרה השתנתה במהלך הפעולה. יש לרענן ולנסות שוב."
                : "לא ניתן להשלים את הפעולה מול מסד הנתונים. יש לנסות שוב מאוחר יותר."
        }, cancellationToken);
        return true;
    }
}
