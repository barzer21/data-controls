<div dir="rtl">

# ‏בקרת נתונים — Data Controls

‏מערכת להגדרה ולהרצה של בקרות איכות נתונים, המיועדת למשתמשים עסקיים ללא ידע ב־SQL. אפשר ליצור, לשמור ולערוך בקרות המבוססות על תנאים וקשרים בין נתונים, ולקבל את הרשומות החריגות ואת הסיבות לחריגה. מנגנון הבקרות גנרי ומאפשר להגדיר בקרות חדשות ללא פיתוח קוד נוסף.

‏בנוסף, המערכת מדגימה יצירת בקרה מתיאור עסקי באמצעות שירות AI מדומה (Mock), עם אישור המשתמש לפני שמירה או הרצה. הממשק בעברית וב־RTL.

## ‏יכולות ודוגמאות שימוש

- ‏יצירה ועריכה של תנאים וקבוצות AND/OR מקוננות, כולל שדות קשורים.
- ‏ספריית בקרות עם שמירה, דפדוף, עריכה, מחיקה והרצה.
- ‏הרצת טיוטה ללא שמירה, הצגת סיבות לחריגה וחיפוש וסינון בתוצאות.
- ‏יצירת הצעת בקרה באמצעות Mock, עריכתה ואישורה בממשק.

‏לדוגמה: איתור עובדים שגילם קטן מ־18 ושכרם גבוה מ־15,000, עובדים שסיום העסקתם מוקדם מתחילתה, או עובדים פעילים במחלקה לא פעילה. תנאי שמתקיים מסמן חריגה. דוגמאות נוספות וקובצי JSON נמצאים ב־[מסמך הבקרות](docs/EXAMPLE_RULES.md).

## ‏דרישות סביבה

‏ההוראות מיועדות ל־Windows ו־PowerShell. נדרשים:

- ‏‎.NET 10 SDK.
- ‏Node.js בטווח `^22.22.3 || ^24.15.0 || ^26.0.0`, לפי `frontend/package.json`, ו־npm.
- ‏Python 3.13 עם אפשרות ליצור סביבה וירטואלית.
- ‏SQL Server זמין ו־SSMS או כלי להרצת סקריפטי SQL.
- ‏הרשאות להקמת ה־DB ולהגדרת משתמש הקריאה שלו.

‏כל הפקודות מורצות משורש הפרויקט. אין צורך במפתח API: שירות ההצעות אינו פונה למודל חיצוני.

## ‏1. הקמת הדאטה בייס

‏לדאטה בייס חדש, הריצו ב־SSMS פעם אחת ובסדר הבא:

1. ‏[01 — יצירת דאטה בייס](database/01_create_database.sql)
2. ‏[02 — טבלאות עסקיות](database/02_create_tables.sql)
3. ‏[03 — נתוני דוגמה](database/03_seed_data.sql)
4. ‏[04 — טבלת בקרות](database/04_create_rules.sql)
5. ‏[05 — משתמש בעל הרשאות קריאה מוגבלות](database/05_rule_reader.sql)
6. ‏[06 — סימון מקור AI](database/06_add_rule_ai_origin.sql)
7. ‏[07 — טעינת 10 בקרות לדוגמה](database/07_seed_rules.sql)

‏סקריפט 07 מוסיף בקרות שאפשר לערוך ולהריץ מהספרייה. הרצה חוזרת אינה מוסיפה בקרה עם אותו שם וסוג נתונים ואינה דורסת אותה. הבקרות אינן נטענות אוטומטית בהפעלת הפרויקט ואינן מסומנות כתוצר של AI.

‏אם ה־DB כבר קיים, בדקו אילו סקריפטים כבר הוחלו; אין להריץ מחדש את כל סקריפטי יצירת מבנה הדאטה בייס.

‏הגדרות הפיתוח משתמשות באימות Windows מול `localhost` וב־DB בשם `DataControlsDb`. התאימו את החיבור ב־`backend/DataControls.Api/appsettings.Development.json`, או דרך משתנה הסביבה `ConnectionStrings__DefaultConnection`. אין לשמור סיסמאות ב־Git.

‏משתמש החיבור של היישום צריך הרשאות CRUD לבקרות ויכולת `IMPERSONATE` על `DataControlsRuleReader`. סקריפט 05 מגדיר את משתמש הקריאה והרשאותיו, אך אינו מעניק אוטומטית הרשאת impersonation למשתמש חיבור חדש. עליית השרת דורשת DB זמין התואם לקטלוג השדות.

‏מסלול חלופי להקמת המבנה הוא EF Core, לאחר התקנת כלי EF CLI והתאמת החיבור: `dotnet ef database update --project backend/DataControls.Api -- --environment Development`. אין להחיל את אותן מיגרציות בשני המסלולים; הסקריפטים רושמים אותן בהיסטוריית EF. גם במסלול EF נדרשים סקריפטים 03, 05 ו־07.

## ‏2. התקנת תלויות

<div dir="ltr">

```powershell
dotnet restore backend/DataControls.slnx
npm.cmd --prefix frontend ci
python -m venv python-ai/.venv
.\python-ai\.venv\Scripts\python.exe -m pip install -r python-ai/requirements.txt
```

</div>

‏לפני התקנה מחדש עצרו שירותים פועלים באמצעות `Ctrl+C`, כדי למנוע נעילת קבצים. אין צורך להפעיל את סביבת Python ב־Activate. השימוש ב־`npm.cmd` מונע חסימה של `npm.ps1` בחלק מהגדרות PowerShell.

## ‏3. הפעלה בשלושה טרמינלים

‏בטרמינל הראשון — Python:

<div dir="ltr">

```powershell
.\python-ai\.venv\Scripts\python.exe -m uvicorn api:app --app-dir python-ai --host 127.0.0.1 --port 8000
```

</div>

‏בטרמינל השני — ‎.NET:

<div dir="ltr">

```powershell
dotnet run --project backend/DataControls.Api --launch-profile http
```

</div>

‏בטרמינל השלישי — Angular:

<div dir="ltr">

```powershell
npm.cmd --prefix frontend start
```

</div>

‏פתחו [את הממשק המקומי](http://localhost:4200).

| ‏שירות | ‏כתובת |
| --- | --- |
| ‏Angular | ‏`http://localhost:4200` |
| ‏מטא־דאטה של ה־API | ‏`http://localhost:5037/api/metadata` |
| ‏תיעוד FastAPI | ‏`http://127.0.0.1:8000/docs` |

‏ה־proxy ב־`frontend/proxy.conf.json` מעביר `/api` לבקאנד בפורט 5037; שינויו דורש הפעלה מחדש של Angular. כתובת Python מוגדרת ב־`AiService:BaseUrl` וניתנת לעקיפה באמצעות `AiService__BaseUrl`.

## AI Demo

‏**הדגמת יצירת בקרה בעזרת AI**

1. ‏הפעילו את שלושת השירותים ופתחו את הממשק.
2. ‏בסרגל הצד לחצו על „יצירת בקרה בעזרת AI”. בחרו אחת מחמש הדוגמאות ולחצו „יצירת הצעה לבדיקה”. ה־Mock תומך בנוסחים המדויקים שמופיעים בדוגמאות בלבד.
3. ‏בדקו את השם, התיאור והתנאים שהוחזרו. אפשר לערוך את ההצעה; לפני אישורה השמירה וההרצה מושבתות.
4. ‏סמנו את אישור ההצעה ולחצו „הרצת טיוטה ללא שמירה”. יוצגו החריגות והסיבות להן. שינוי בהצעה מאפס את האישור.
5. ‏שמרו את הבקרה, חזרו לספרייה והפעילו אותה משם. אפשר גם לערוך ולשמור אותה מחדש.

‏ההצעה משתמשת באותו מנוע בקרות המשמש ליצירה ידנית. דוגמאות ה־JSON שבמסמך הבקרות אינן בהכרח נוסחים שה־Mock מקבל.

## ‏בנייה ובדיקות

<div dir="ltr">

```powershell
dotnet build backend/DataControls.slnx -c Release
npm.cmd --prefix frontend run build

dotnet run --project backend/tests/CompilerChecks -c Release -p:UseAppHost=false
.\python-ai\.venv\Scripts\python.exe -B -m unittest discover -s python-ai -p "test_*.py"
npm.cmd --prefix frontend test -- --watch=false
```

</div>

‏הבדיקות לעיל אינן דורשות DB פעיל. לבדיקת הקמה מלאה מסקריפטי ה־SQL והרצת עשר בקרות הדוגמה, לאחר בניית Release:

<div dir="ltr">

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File backend/tests/Test-SubmissionSetup.ps1
```

</div>

‏בדיקת ההקמה דורשת SQL Server, ‏`sqlcmd` והרשאה ליצור ולהסיר DB. היא יוצרת DB זמני ומסירה אותו בסיום, ללא שינוי בנתוני ה־DB הרגיל.

## ‏מסמכים נוספים

| ‏נושא | ‏מסמך |
| --- | --- |
| ‏רכיבים, מנוע הבקרות וזרימת הנתונים | ‏[ארכיטקטורה](docs/ARCHITECTURE.md) |
| ‏בחירות תכנון, הנחות ומגבלות | ‏[החלטות ומגבלות](docs/DESIGN_AND_LIMITATIONS.md) |
| ‏רכיבי הממשק והקשרים ביניהם | ‏[מפת קומפוננטות](docs/UI_COMPONENTS.md) |
| ‏דוגמאות עסקיות ובקשות API | ‏[דוגמאות לבקרות](docs/EXAMPLE_RULES.md) |
| ‏מימוש הצעות הבקרה ובדיקה ישירה של Python | ‏[יצירת בקרה בעזרת AI](docs/AI_SERVICE.md) |
| ‏כלי AI ששימשו בפיתוח | ‏[שימוש בכלי AI](docs/AI_USAGE.md) |
| ‏משימת הרשות — תכנון בלבד | ‏[הצעות יזומות לבקרות](docs/AI_RULE_SUGGESTIONS_PLAN.md) |

‏דוגמאות נוספות לבקשות נמצאות בקובצי `.http` תחת `backend/DataControls.Api`.

</div>
