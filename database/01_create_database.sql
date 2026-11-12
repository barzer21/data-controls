USE [master];
GO

IF DB_ID(N'DataControlsDb') IS NULL
BEGIN
    CREATE DATABASE [DataControlsDb];
END;
GO
