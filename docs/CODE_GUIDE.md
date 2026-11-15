# מפת הקוד לקראת מעבר משותף

## המבנה הכללי

| תיקייה | אחריות |
| --- | --- |
| `frontend` | ממשק Angular בעברית וב־RTL |
| `backend/DataControls.Api` | API, אימות בקרות, שמירה והרצת שאילתות |
| `python-ai` | שירות FastAPI שמחזיר הצעות דמה לבקרות |
| `database` | סקריפטים להקמה ולשדרוג המסד |
| `backend/tests`, קובצי `*.spec.ts` | בדיקות שמגנות על ההתנהגות |
| `docs` | הסברים על החלטות, חוזי API ויכולות |

## מסלול קריאה מומלץ

1. `frontend/src/main.ts` ו־`app/app.config.ts`: הפעלת Angular והשירותים שלו.
2. `app/app.component.ts` ו־`app/app.routes.ts`: מעטפת הממשק, סרגל הצד והמסכים.
3. `features/rules/saved-rules-page`: טעינת רשימת הבקרות; `saved-rules-list` מציג אותה ומדווח על לחיצות.
4. `features/rules/rule-editor-page`: פתיחת יצירה או עריכה, טעינת מטא־דאטה והגנה על טיוטה בעת ניווט.
5. `features/rules/rule-editor`: הטיוטה, עדכונים, אישור AI, אימות, שמירה והרצה. הרכיבים ב־`shared` מציגים כרטיסים, תנאים, סיכום ותוצאות.
6. `core/api/rules-api.service.ts`: בקשות HTTP לשרת. `core/routing/rule-library-navigation.service.ts` מטפל בחזרה לספרייה אחרי שמירה מוצלחת.
7. `backend/DataControls.Api/Controllers/RulesController.cs` ומשם ל־`Rules/RuleService.cs`: קבלת הבקשה, אימות ושמירה.
8. `Rules/RuleSqlCompiler.cs`, `RuleExecutionService.cs` ו־`RuleExecutor.cs`: תרגום תנאי הבקרה ל־SQL פרמטרי והרצה לקריאה בלבד.

## מסלול יצירת בקרה בעזרת AI

`ai-rule-page` מנהל את המסך, `ai-rule-creator` אוסף את התיאור ושולח בקשה דרך `ai-proposals-api.service.ts`. שרת ‎.NET מקבל אותה ב־`AiProposalsController`, מוסיף מטא־דאטה עסקי ופונה ל־`PythonAiRuleProposalProvider`.

בפייתון מתחילים ב־`api.py`, ממשיכים ל־`models.py`, ל־`mock_ai.py` ול־`metadata_validation.py`. ההצעה חוזרת דרך השרת לעורך המשותף. היא אינה נשמרת ואינה מורצת אוטומטית.

`main.py` ו־`request.json` הם מסלול לימודי חלופי לקריאה וכתיבה של קבצים. שירות ה־HTTP אינו תלוי בהם. `proposal.json` הוא פלט מקומי שנוצר בהרצה ואינו חלק מקוד המקור.

## עקרונות שכדאי לזהות בקריאה

- ה־signals מחזיקים את מצב הממשק; RxJS מנהל בקשות, ביטולים ותוצאות אסינכרוניות.
- רכיבי המסך מתאמים את הפעולות. רוב הרכיבים ב־`shared` מקבלים קלט ומדווחים על שינוי; רכיב תוצאות הטיוטה המסוננות גם מנהל בקשות הרצה.
- שמירה והרצה נפרדות. שתיהן משתמשות באימות השרת.
- חיפוש וסינון בתוצאות אינם משנים את הבקרה.
- תנאים מקוננים נשמרים כעץ; המבנה חשוב למשמעות „וגם / או”.
- המיגרציות וסקריפטי המסד נשארים בפרויקט גם לאחר שהורצו, כדי שאפשר יהיה להקים ולעדכן סביבות נוספות.
