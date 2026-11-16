using Microsoft.Data.SqlClient;

namespace DataControls.Api.Metadata;

public sealed class SqlServerMetadataValidator(IConfiguration configuration)
{
    public async Task ValidateAsync(MetadataCatalog catalog, CancellationToken cancellationToken)
    {
        // Fixed catalog queries: no SQL identifiers or expressions from JSON are executed.
        const string sql = """
            SELECT s.name, t.name, c.name, TYPE_NAME(c.system_type_id)
            FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
            JOIN sys.columns c ON c.object_id=t.object_id;

            SELECT s.name, t.name, c.name
            FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
            JOIN sys.indexes i ON i.object_id=t.object_id AND i.is_primary_key=1
            JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
            JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
            WHERE (SELECT COUNT(*) FROM sys.index_columns k
                WHERE k.object_id=i.object_id AND k.index_id=i.index_id AND k.key_ordinal>0)=1;

            SELECT ps.name, pt.name, pc.name, rs.name, rt.name, rc.name
            FROM sys.foreign_keys fk
            JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
            JOIN sys.tables pt ON pt.object_id=fkc.parent_object_id
            JOIN sys.schemas ps ON ps.schema_id=pt.schema_id
            JOIN sys.columns pc ON pc.object_id=pt.object_id AND pc.column_id=fkc.parent_column_id
            JOIN sys.tables rt ON rt.object_id=fkc.referenced_object_id
            JOIN sys.schemas rs ON rs.schema_id=rt.schema_id
            JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fkc.referenced_column_id
            WHERE fk.is_disabled=0 AND fk.is_not_trusted=0
              AND (SELECT COUNT(*) FROM sys.foreign_key_columns k WHERE k.constraint_object_id=fk.object_id)=1;
            """;
        await using var connection = new SqlConnection(configuration.GetConnectionString("DefaultConnection"));
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = 15 };
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var columns = new Dictionary<(string, string, string), string>();
        while (await reader.ReadAsync(cancellationToken))
            columns.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)), reader.GetString(3));
        await reader.NextResultAsync(cancellationToken);
        var keys = new HashSet<(string, string, string)>();
        while (await reader.ReadAsync(cancellationToken))
            keys.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2)));
        await reader.NextResultAsync(cancellationToken);
        var foreignKeys = new HashSet<(string, string, string, string, string, string)>();
        while (await reader.ReadAsync(cancellationToken))
            foreignKeys.Add((reader.GetString(0), reader.GetString(1), reader.GetString(2),
                reader.GetString(3), reader.GetString(4), reader.GetString(5)));

        foreach (var entity in catalog.Entities)
        {
            if (!keys.Contains((entity.Schema, entity.Table, entity.KeyColumn)))
                throw new InvalidOperationException($"Metadata entity {entity.Id}: table or single-column primary key not found.");
            foreach (var field in entity.Fields)
            {
                // Calculation sources are validated as ordinary physical fields in this same loop.
                if (field.Calculation is not null) continue;
                if (!columns.TryGetValue((entity.Schema, entity.Table, field.Column!), out var sqlType))
                    throw new InvalidOperationException($"Metadata field {entity.Id}.{field.Id}: column {field.Column} not found.");
                if (!Compatible(field.Type, sqlType))
                    throw new InvalidOperationException($"Metadata field {entity.Id}.{field.Id}: {field.Type} is incompatible with SQL type {sqlType}.");
            }
        }
        var entities = catalog.Entities.ToDictionary(e => e.Id, StringComparer.OrdinalIgnoreCase);
        foreach (var relationship in catalog.Relationships)
        {
            var from = entities[relationship.FromEntity];
            var to = entities[relationship.ToEntity];
            if (!foreignKeys.Contains((from.Schema, from.Table, relationship.FromColumn,
                to.Schema, to.Table, relationship.ToColumn)))
                throw new InvalidOperationException($"Metadata relationship {relationship.Id}: enabled, trusted single-column foreign key not found.");
        }
    }

    private static bool Compatible(string type, string sqlType) => type switch
    {
        "text" => sqlType is "nvarchar" or "varchar" or "nchar" or "char",
        "number" => sqlType is "tinyint" or "smallint" or "int" or "bigint" or "decimal" or "numeric"
            or "money" or "smallmoney" or "float" or "real",
        "date" => sqlType is "date" or "datetime" or "datetime2" or "smalldatetime",
        "boolean" => sqlType == "bit",
        _ => false
    };
}
