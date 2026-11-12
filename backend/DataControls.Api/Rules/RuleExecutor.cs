using System.Data;
using Microsoft.Data.SqlClient;

namespace DataControls.Api.Rules;

public sealed record RuleViolation(object Id, IReadOnlyDictionary<string, object?> Values);
public sealed record RuleExecutionResponse(long TotalCount, int ReturnedCount, bool Truncated,
    IReadOnlyList<RuleResultColumn> Columns, IReadOnlyList<RuleViolation> Records);
public sealed class RuleExecutionTimeoutException : TimeoutException;

public sealed class RuleExecutor(IConfiguration configuration)
{
    public const int MaxLimit = 500;

    public async Task<RuleExecutionResponse> ExecuteAsync(CompiledRule query, int limit, CancellationToken cancellationToken)
    {
        if (limit is < 1 or > MaxLimit) throw new ArgumentOutOfRangeException(nameof(limit));
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        deadline.CancelAfter(TimeSpan.FromSeconds(30));
        // Disable pooling for this separate impersonated connection: no identity can leak to CRUD.
        var builder = new SqlConnectionStringBuilder(configuration.GetConnectionString("DefaultConnection"))
        {
            Pooling = false,
            ConnectTimeout = 10
        };
        await using var connection = new SqlConnection(builder.ConnectionString);
        try
        {
            await connection.OpenAsync(deadline.Token);
            await using (var identity = new SqlCommand("EXECUTE AS USER = N'DataControlsRuleReader';", connection)
                { CommandTimeout = 10 })
                await identity.ExecuteNonQueryAsync(deadline.Token);

            await using var command = new SqlCommand(query.Sql, connection) { CommandTimeout = 15 };
            command.Parameters.Add(new SqlParameter("@__limit", SqlDbType.Int) { Value = limit });
            foreach (var parameter in query.Parameters)
            {
                var sqlParameter = new SqlParameter(parameter.Name, parameter.Type) { Value = parameter.Value };
                if (parameter.Type == SqlDbType.NVarChar) sqlParameter.Size = 4000;
                if (parameter.Type == SqlDbType.Decimal) { sqlParameter.Precision = 29; sqlParameter.Scale = parameter.Scale; }
                command.Parameters.Add(sqlParameter);
            }
            await using var reader = await command.ExecuteReaderAsync(deadline.Token);
            var records = new List<RuleViolation>();
            long totalCount = 0;
            while (await reader.ReadAsync(deadline.Token))
            {
                totalCount = reader.GetInt64(0);
                var values = new Dictionary<string, object?>();
                for (var i = 0; i < query.Columns.Count; i++)
                {
                    var value = reader.IsDBNull(i + 2) ? null : reader.GetValue(i + 2);
                    if (value is DateTime date && query.Columns[i].Type == "date") value = DateOnly.FromDateTime(date);
                    values.Add(query.Columns[i].Id, value);
                }
                records.Add(new(reader.GetValue(1), values));
            }
            return new(totalCount, records.Count, totalCount > records.Count, query.Columns, records);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new RuleExecutionTimeoutException();
        }
        // Disposing the unpooled connection ends EXECUTE AS even when execution is cancelled.
    }
}
