USE [DataControlsDb];
GO

BEGIN TRANSACTION;
CREATE TABLE [Rules] (
    [Id] int NOT NULL IDENTITY,
    [Name] nvarchar(200) NOT NULL,
    [Description] nvarchar(2000) NULL,
    [RootEntityId] nvarchar(max) NOT NULL,
    [ConditionJson] nvarchar(max) NOT NULL,
    [DefinitionVersion] int NOT NULL,
    [CreatedAtUtc] datetimeoffset NOT NULL,
    [UpdatedAtUtc] datetimeoffset NOT NULL,
    CONSTRAINT [PK_Rules] PRIMARY KEY ([Id]),
    CONSTRAINT [CK_Rules_ConditionJson] CHECK (ISJSON([ConditionJson]) = 1)
);

INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20261112093455_AddSavedRules', N'10.0.0');

COMMIT;
GO
