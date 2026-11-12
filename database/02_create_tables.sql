USE [DataControlsDb];
GO

CREATE TABLE [dbo].[Departments] (
    [Id] int IDENTITY(1,1) NOT NULL,
    [Name] nvarchar(100) NOT NULL,
    [IsActive] bit NOT NULL,
    [ManagerName] nvarchar(100) NULL,
    CONSTRAINT [PK_Departments] PRIMARY KEY ([Id])
);
GO

CREATE TABLE [dbo].[Employees] (
    [Id] int IDENTITY(1,1) NOT NULL,
    [FirstName] nvarchar(100) NOT NULL,
    [LastName] nvarchar(100) NOT NULL,
    [BirthDate] datetime2 NULL,
    [Salary] decimal(18,2) NULL,
    [StartDate] datetime2 NULL,
    [EndDate] datetime2 NULL,
    [IsActive] bit NOT NULL,
    [DepartmentId] int NULL,
    CONSTRAINT [PK_Employees] PRIMARY KEY ([Id]),
    CONSTRAINT [FK_Employees_Departments_DepartmentId]
        FOREIGN KEY ([DepartmentId]) REFERENCES [dbo].[Departments] ([Id])
        ON DELETE NO ACTION
);
GO

CREATE INDEX [IX_Employees_DepartmentId]
    ON [dbo].[Employees] ([DepartmentId]);
GO

CREATE TABLE [dbo].[__EFMigrationsHistory] (
    [MigrationId] nvarchar(150) NOT NULL,
    [ProductVersion] nvarchar(32) NOT NULL,
    CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
);
GO

INSERT INTO [dbo].[__EFMigrationsHistory] ([MigrationId], [ProductVersion])
VALUES (N'20261112080545_InitialCreate', N'10.0.0');
GO
