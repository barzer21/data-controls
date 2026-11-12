USE [DataControlsDb];
GO

-- Deployment security setup, not an EF schema migration. Safe to run again.
IF DATABASE_PRINCIPAL_ID(N'DataControlsRuleReader') IS NULL
    CREATE USER [DataControlsRuleReader] WITHOUT LOGIN;
GO

GRANT SELECT ON OBJECT::[dbo].[Employees] TO [DataControlsRuleReader];
GRANT SELECT ON OBJECT::[dbo].[Departments] TO [DataControlsRuleReader];
DENY INSERT, UPDATE, DELETE, EXECUTE, ALTER TO [DataControlsRuleReader];
GO
