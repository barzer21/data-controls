USE [DataControlsDb];
GO

BEGIN TRANSACTION;
IF NOT EXISTS (
    SELECT 1 FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20261115085736_AddRuleAiOrigin'
)
BEGIN
    ALTER TABLE [Rules] ADD [CreatedWithAi] bit NOT NULL DEFAULT CAST(0 AS bit);

    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20261115085736_AddRuleAiOrigin', N'10.0.0');
END;
COMMIT;
GO
