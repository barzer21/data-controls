USE [DataControlsDb];
GO

-- Run after scripts 01-06. Adds ten editable examples; never runs automatically at startup.
-- Existing rules with the same name and root entity are preserved, including user edits.
SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @now datetimeoffset = TODATETIMEOFFSET(SYSUTCDATETIME(), '+00:00');

    INSERT INTO [dbo].[Rules]
        ([Name], [Description], [RootEntityId], [ConditionJson], [DefinitionVersion],
         [CreatedAtUtc], [UpdatedAtUtc], [CreatedWithAi])
    SELECT source.[Name], source.[Description], source.[RootEntityId], source.[ConditionJson],
           1, @now, @now, 0
    FROM (VALUES
        (N'עובדים צעירים עם שכר גבוה', N'איתור עובדים שטרם מלאו להם 18 ושכרם גבוה מ־15,000.', N'employee', N'{"kind":"group","operator":"and","children":[{"kind":"comparison","left":{"fieldId":"age"},"operator":"lessThan","right":{"kind":"constant","value":18}},{"kind":"comparison","left":{"fieldId":"salary"},"operator":"greaterThan","right":{"kind":"constant","value":15000}}]}'),
        (N'תקינות תאריכי העסקה', N'איתור עובדים שסיום העסקתם מוקדם מתחילת העסקתם.', N'employee', N'{"kind":"comparison","left":{"fieldId":"endDate"},"operator":"lessThan","right":{"kind":"field","field":{"fieldId":"startDate"}}}'),
        (N'עובדים פעילים במחלקה לא פעילה', N'איתור עובדים פעילים המשויכים למחלקה שאינה פעילה.', N'employee', N'{"kind":"group","operator":"and","children":[{"kind":"comparison","left":{"fieldId":"isActive"},"operator":"equals","right":{"kind":"constant","value":true}},{"kind":"comparison","left":{"fieldId":"isActive","relationshipPath":["employeeDepartment"]},"operator":"equals","right":{"kind":"constant","value":false}}]}'),
        (N'פרטי עובד חסרים', N'איתור עובדים שחסר להם תאריך תחילת העסקה או שיוך למחלקה.', N'employee', N'{"kind":"group","operator":"or","children":[{"kind":"comparison","left":{"fieldId":"startDate"},"operator":"isNull"},{"kind":"comparison","left":{"fieldId":"departmentId"},"operator":"isNull"}]}'),
        (N'מחלקות פעילות ללא מנהל', N'איתור מחלקות פעילות שחסר בהן שם מנהל.', N'department', N'{"kind":"group","operator":"and","children":[{"kind":"comparison","left":{"fieldId":"isActive"},"operator":"equals","right":{"kind":"constant","value":true}},{"kind":"comparison","left":{"fieldId":"managerName"},"operator":"isNull"}]}'),
        (N'שכר גבוה מ־20,000', N'איתור עובדים ששכרם גבוה מ־20,000 לצורך בדיקה עסקית.', N'employee', N'{"kind":"comparison","left":{"fieldId":"salary"},"operator":"greaterThan","right":{"kind":"constant","value":20000}}'),
        (N'מחלקות לא פעילות', N'איתור מחלקות המסומנות כלא פעילות.', N'department', N'{"kind":"comparison","left":{"fieldId":"isActive"},"operator":"equals","right":{"kind":"constant","value":false}}'),
        (N'עובדים במחלקת הפיתוח', N'איתור עובדים במחלקת Engineering באמצעות השוואת טקסט בשדה קשור.', N'employee', N'{"kind":"comparison","left":{"fieldId":"name","relationshipPath":["employeeDepartment"]},"operator":"equals","right":{"kind":"constant","value":"Engineering"}}'),
        (N'תחילת העסקה לפני 2015', N'איתור עובדים שהחלו לעבוד לפני 1 בינואר 2015.', N'employee', N'{"kind":"comparison","left":{"fieldId":"startDate"},"operator":"lessThan","right":{"kind":"constant","value":"2015-01-01"}}'),
        (N'עובדים פעילים לבדיקת שכר או מחלקה', N'איתור עובדים פעילים ששכרם גבוה מ־20,000 או שמחלקתם אינה פעילה; הדגמת קבוצות AND ו־OR מקוננות.', N'employee', N'{"kind":"group","operator":"and","children":[{"kind":"comparison","left":{"fieldId":"isActive"},"operator":"equals","right":{"kind":"constant","value":true}},{"kind":"group","operator":"or","children":[{"kind":"comparison","left":{"fieldId":"salary"},"operator":"greaterThan","right":{"kind":"constant","value":20000}},{"kind":"comparison","left":{"fieldId":"isActive","relationshipPath":["employeeDepartment"]},"operator":"equals","right":{"kind":"constant","value":false}}]}]}')
    ) AS source ([Name], [Description], [RootEntityId], [ConditionJson])
    WHERE NOT EXISTS (
        SELECT 1 FROM [dbo].[Rules] AS existing WITH (UPDLOCK, HOLDLOCK)
        WHERE existing.[Name] = source.[Name]
          AND existing.[RootEntityId] = source.[RootEntityId]
    );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
