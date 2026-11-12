USE [DataControlsDb];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO [dbo].[Departments] ([Name], [IsActive], [ManagerName])
    SELECT source.[Name], source.[IsActive], source.[ManagerName]
    FROM (VALUES
        (N'Engineering', 1, N'Dana Cohen'),
        (N'Finance', 1, N'Rami Levi'),
        (N'Operations', 1, NULL),
        (N'Sales', 0, N'Yael Amir'),
        (N'Human Resources', 1, N'Oren Barak')
    ) AS source ([Name], [IsActive], [ManagerName])
    WHERE NOT EXISTS (
        SELECT 1
        FROM [dbo].[Departments] AS existing
        WHERE existing.[Name] = source.[Name]
    );

    INSERT INTO [dbo].[Employees] (
        [FirstName],
        [LastName],
        [BirthDate],
        [Salary],
        [StartDate],
        [EndDate],
        [IsActive],
        [DepartmentId]
    )
    SELECT
        source.[FirstName],
        source.[LastName],
        source.[BirthDate],
        source.[Salary],
        source.[StartDate],
        source.[EndDate],
        source.[IsActive],
        department.[Id]
    FROM (VALUES
        (N'Adi', N'Cohen', CONVERT(datetime2, '1993-03-12'), 14500.00, CONVERT(datetime2, '2018-01-15'), NULL, 1, N'Engineering'),
        (N'Noam', N'Levi', CONVERT(datetime2, '1988-07-24'), 17200.00, CONVERT(datetime2, '2016-05-01'), NULL, 1, N'Finance'),
        (N'Maya', N'Amir', CONVERT(datetime2, '1996-11-02'), 13200.00, CONVERT(datetime2, '2020-09-10'), NULL, 1, N'Operations'),
        (N'Ori', N'BenDavid', CONVERT(datetime2, '1990-02-18'), 18800.00, CONVERT(datetime2, '2017-03-20'), NULL, 1, N'Engineering'),
        (N'Dana', N'Barak', CONVERT(datetime2, '1985-06-30'), 21000.00, CONVERT(datetime2, '2012-08-01'), NULL, 1, N'Human Resources'),
        (N'Yael', N'Azulay', CONVERT(datetime2, '1999-01-09'), 11900.00, CONVERT(datetime2, '2022-02-14'), NULL, 1, N'Sales'),
        (N'Itai', N'Shalev', CONVERT(datetime2, '1994-05-17'), 15750.00, CONVERT(datetime2, '2019-06-03'), NULL, 1, N'Finance'),
        (N'Roni', N'Katz', CONVERT(datetime2, '1982-12-21'), 23500.00, CONVERT(datetime2, '2010-11-15'), NULL, 1, N'Engineering'),
        (N'Eitan', N'Peretz', CONVERT(datetime2, '1991-08-05'), 16400.00, CONVERT(datetime2, '2015-04-27'), NULL, 1, N'Operations'),
        (N'Lior', N'Naveh', CONVERT(datetime2, '1997-04-13'), 12800.00, CONVERT(datetime2, '2021-07-19'), NULL, 1, N'Human Resources'),
        (N'Tal', N'Gal', CONVERT(datetime2, '1989-09-28'), 19300.00, CONVERT(datetime2, '2014-01-06'), NULL, 1, N'Engineering'),
        (N'Neta', N'Moran', CONVERT(datetime2, '1995-10-11'), 15100.00, CONVERT(datetime2, '2018-10-22'), NULL, 1, N'Finance'),
        (N'Amir', N'Harel', CONVERT(datetime2, '1987-03-04'), 22100.00, CONVERT(datetime2, '2011-02-01'), NULL, 1, N'Operations'),
        (N'Shira', N'Weiss', CONVERT(datetime2, '2009-04-04'), 18000.00, CONVERT(datetime2, '2025-01-01'), NULL, 1, N'Engineering'),
        (N'Yoni', N'Sadeh', CONVERT(datetime2, '1992-06-16'), 14600.00, CONVERT(datetime2, '2023-08-01'), CONVERT(datetime2, '2023-07-31'), 0, N'Finance'),
        (N'Eden', N'Dayan', CONVERT(datetime2, '1998-12-03'), 13900.00, CONVERT(datetime2, '2022-04-18'), NULL, 1, N'Sales'),
        (N'Keren', N'Sela', CONVERT(datetime2, '1993-02-25'), 16800.00, NULL, NULL, 1, N'Operations'),
        (N'Tomer', N'Koren', CONVERT(datetime2, '1986-07-08'), 20100.00, CONVERT(datetime2, '2013-09-02'), NULL, 1, N'Engineering'),
        (N'Noga', N'Regev', CONVERT(datetime2, '2000-05-19'), 12500.00, CONVERT(datetime2, '2024-01-08'), NULL, 1, NULL),
        (N'Yuval', N'Gil', DATEADD(YEAR, -17, CONVERT(date, GETDATE())), 16500.00, CONVERT(datetime2, '2025-06-01'), NULL, 1, N'Human Resources')
    ) AS source (
        [FirstName],
        [LastName],
        [BirthDate],
        [Salary],
        [StartDate],
        [EndDate],
        [IsActive],
        [DepartmentName]
    )
    LEFT JOIN [dbo].[Departments] AS department
        ON department.[Name] = source.[DepartmentName]
    WHERE
        (source.[DepartmentName] IS NULL OR department.[Id] IS NOT NULL)
        AND NOT EXISTS (
            SELECT 1
            FROM [dbo].[Employees] AS existing
            WHERE existing.[FirstName] = source.[FirstName]
                AND existing.[LastName] = source.[LastName]
        );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
    BEGIN
        ROLLBACK TRANSACTION;
    END;

    THROW;
END CATCH;
GO
