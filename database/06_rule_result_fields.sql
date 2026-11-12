USE [DataControlsDb];
GO

BEGIN TRANSACTION;
ALTER TABLE [Rules] ADD [ResultFieldsJson] nvarchar(max) NULL;
GO

ALTER TABLE [Rules] ADD CONSTRAINT [CK_Rules_ResultFieldsJson] CHECK ([ResultFieldsJson] IS NULL OR ISJSON([ResultFieldsJson]) = 1);

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20261112103841_AddRuleResultFields', N'10.0.0');

COMMIT;
GO
