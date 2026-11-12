using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace DataControls.Api.Data;

public sealed class PersistenceExceptionHandler(ILogger<PersistenceExceptionHandler> logger) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext context, Exception exception,
        CancellationToken cancellationToken)
    {
        if (exception is not (SqlException or DbUpdateException)) return false;
        logger.LogError(exception, "Database operation failed for {Path}", context.Request.Path);
        var conflict = exception is DbUpdateConcurrencyException;
        context.Response.StatusCode = conflict ? StatusCodes.Status409Conflict : StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new ProblemDetails
        {
            Status = context.Response.StatusCode,
            Title = conflict ? "הבקרה השתנתה במהלך הפעולה. יש לרענן ולנסות שוב."
                : "לא ניתן להשלים את הפעולה מול מסד הנתונים. יש לנסות שוב מאוחר יותר."
        }, cancellationToken);
        return true;
    }
}
