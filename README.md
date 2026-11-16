# בקרת נתונים — Data Controls

יישום בעברית וב־RTL להגדרת בקרות עסקיות, שמירה והרצה על נתוני SQL Server. הבקרות נבנות כתנאים מקוננים ללא SQL, והתוצאות כוללות סיבות לחריגה, חיפוש וסינון. שירות Python מספק הצעות דמה שדורשות בדיקה ואישור בממשק.

## מדריך למסמכים

| נושא | מסמך |
| --- | --- |
| מבנה המערכת ומנוע הבקרות | [ארכיטקטורה](docs/ARCHITECTURE.md) |
| מעבר לימודי על הקוד | [מפת הקוד](docs/CODE_GUIDE.md) |
| דוגמאות עסקיות וקובצי JSON להרצה | [דוגמאות לבקרות](docs/EXAMPLE_RULES.md) |
| שימוש בכלי AI בפיתוח | [גילוי שימוש ב־AI](docs/AI_USAGE.md) |
| החלטות, הנחות, מגבלות ודרישות | [DECISIONS](DECISIONS.md), [REQUIREMENTS](REQUIREMENTS.md) |

## דרישות סביבת פיתוח

ההוראות להלן מיועדות ל־Windows ו־PowerShell:

- ‎.NET 10 SDK.
- Node.js בטווח `^22.22.3 || ^24.15.0 || ^26.0.0`, לפי `frontend/package.json`, ו־npm.
- Python 3.13 עם אפשרות ליצור סביבה וירטואלית.
- SQL Server זמין ו־SSMS או כלי להרצת סקריפטי SQL.
- זהות חיבור בעלת הרשאות הקמת סכמה לצורך ההתקנה. הגדרות הפיתוח משתמשות בחיבור Windows לשרת `localhost` ולדאטה בייס `DataControlsDb`.

הפקודות מתבצעות משורש הפרויקט, אלא אם מצוין אחרת. אין צורך במפתח API למודל: המימוש הנוכחי הוא mock.

## 1. הקמת הדאטה בייס

לדאטה בייס חדש, הריצו ב־SSMS פעם אחת ובסדר הבא:

1. [01 — יצירת דאטה בייס](database/01_create_database.sql)
2. [02 — טבלאות עסקיות](database/02_create_tables.sql)
3. [03 — נתוני דוגמה](database/03_seed_data.sql)
4. [04 — טבלת בקרות](database/04_create_rules.sql)
5. [05 — זהות קריאה מוגבלת](database/05_rule_reader.sql)
6. [06 — סימון מקור AI](database/06_add_rule_ai_origin.sql)

בדאטה בייס קיים שכבר הוקם בגרסה הקודמת, יש לבדוק אילו שדרוגים חסרים; אין להריץ מחדש את כל סקריפטי יצירת הסכמה. הוספת גיל וספירת הרשומות אינה דורשת מיגרציה.

סקריפטי הסכמה רושמים את המיגרציות בהיסטוריית EF. אפשר לבחור במקום זאת במסלול `dotnet ef database update`, אך אין להחיל את אותן מיגרציות בשני המסלולים. נתוני הדוגמה והרשאות הקריאה עדיין דורשים את סקריפטים 03 ו־05. כלי EF CLI נדרש רק למסלול החלופי ואינו מותקן אוטומטית בהוראות האלה.

זהות החיבור של השרת צריכה הרשאות CRUD לבקרות ויכולת `IMPERSONATE` על `DataControlsRuleReader`. סקריפט 05 מגדיר את משתמש הקריאה והרשאותיו, ואינו מעניק אוטומטית impersonation לזהות יישום חדשה.

בדקו את `backend/DataControls.Api/appsettings.Development.json` והתאימו את החיבור לסביבה שלכם. אפשר לעקוף אותו דרך `ConnectionStrings__DefaultConnection`. אין לשמור סיסמאות ב־Git.

## 2. התקנת תלויות

```powershell
dotnet restore backend/DataControls.slnx

npm.cmd --prefix frontend ci

python -m venv python-ai/.venv
.\python-ai\.venv\Scripts\python.exe -m pip install -r python-ai/requirements.txt
```

`npm.cmd` משמש כדי להימנע מחסימת `npm.ps1` בחלק מהגדרות PowerShell. אין צורך להפעיל את סביבת Python ב־Activate; אפשר לפנות ישירות למפרש שבתוכה.

## 3. הפעלה בשלושה טרמינלים

בטרמינל הראשון — שירות Python:

```powershell
.\python-ai\.venv\Scripts\python.exe -m uvicorn api:app --app-dir python-ai --host 127.0.0.1 --port 8000
```

בטרמינל השני — בקאנד:

```powershell
dotnet run --project backend/DataControls.Api --launch-profile http
```

בטרמינל השלישי — Angular:

```powershell
npm.cmd --prefix frontend start
```

פתחו [את הממשק המקומי](http://localhost:4200).

| שירות | כתובת |
| --- | --- |
| Angular | `http://localhost:4200` |
| מטא־דאטה של ה־API | `http://localhost:5037/api/metadata` |
| תיעוד FastAPI מקומי | `http://127.0.0.1:8000/docs` |

ה־proxy בקובץ `frontend/proxy.conf.json` מעביר בקשות `/api` לבקאנד בפורט 5037. שינויו דורש הפעלה מחדש של Angular. כתובת Python מוגדרת ב־`AiService:BaseUrl` וניתנת לעקיפה באמצעות `AiService__BaseUrl`.

הבקאנד בודק את הקטלוג מול הסכמה בעת העלייה. דאטה בייס לא זמין או מיפוי לא תקין מונעים עלייה. שינוי ב־`metadata.json` דורש הפעלה מחדש של הבקאנד ורענון הדפדפן.

## שימוש במערכת

- ספריית הבקרות: דפדוף, מספור רציף, תג מקור AI, עריכה והרצה.
- יצירת בקרה חדשה: בחירת נתונים בכרטיסים, תנאי AND/OR, שדות קשורים, שם ותיאור.
- עריכה והצגה: מעבר בין טופס לבין הגדרה לקריאה בלבד בלי לאבד את הטיוטה.
- שמירה: אימות, יצירה או עדכון, ואז חזרה לספרייה עם הודעת הצלחה.
- הרצה: אינה שומרת את הטיוטה. התוצאות כוללות חריגות תואמות מתוך כלל רשומות הישות, ערכים וסיבות לחריגה.
- סינון: לפי שדות מוצגים, כולל גיל מחושב. חיפוש כללי מיועד לשדות טקסט. הסינון מתבצע בשרת ואינו משנה את הבקרה.
- יצירת AI: בחירה באחת מחמש הדוגמאות הנתמכות, קבלת הצעה ואישור מפורש לפני שמירה או הרצה. שינוי בהצעה מאפס את האישור.

גיל מחושב בשנים מלאות מתאריך הלידה לפי תאריך UTC של ההרצה. המדיניות לתאריכים חסרים, עתידיים ו־29 בפברואר מפורטת ב־[החלטות ומגבלות](DECISIONS.md).

## API ותיעוד מפורט

| נושא | מסמך |
| --- | --- |
| שירות Python וזרימת AI | [AI_SERVICE](docs/AI_SERVICE.md), [Python README](python-ai/README.md) |
| מבנה Angular והרצה | [Frontend README](frontend/README.md) |

דוגמאות בקשות נמצאות גם בקובצי `.http` תחת `backend/DataControls.Api`. הבדל חשוב: שמירה ואימות מקבלים את ההגדרה ישירות; הרצת טיוטה מקבלת `{ "definition": { ... }, "options": { ... } }`.

## בנייה ובדיקות

```powershell
dotnet build backend/DataControls.slnx -c Release
dotnet run --project backend/tests/CompilerChecks -c Release -p:UseAppHost=false
dotnet run --project backend/tests/AgeChecks -c Release -p:UseAppHost=false

npm.cmd --prefix frontend run build
npm.cmd --prefix frontend test -- --watch=false
```

בדיקות הקומפיילר אינן מריצות SQL. בדיקות הגיל מריצות SQL לקריאה בלבד מול נתוני VALUES, ודורשות SQL Server; הן אינן יוצרות טבלאות ואינן משנות נתונים.

בדיקות נוספות והדרישות שלהן:

- `frontend/tools/check-rule-workflows.mjs`: בדיקות דפדפן מול build ותגובות API מדומות. דורש Edge מותקן, או כתובת לדפדפן מתאים במשתנה `BROWSER_TEST_EXECUTABLE`.
- `backend/tests/check_age_api.py`: API זמני מול דאטה בייס הפיתוח, לקריאה בלבד; דורש build של Release ונתוני דוגמה.
- `backend/tests/Test-RulePersistence.ps1`: יוצר דאטה בייס בדיקה נפרד.
- בדיקות שירות Python והחיבור אליו: [AI_SERVICE](docs/AI_SERVICE.md).

האימות האחרון של שינויי גיל וספירה כלל 115 בדיקות Angular, 49 בדיקות קומפיילר, 55 בדיקות גיל/ספירה, בדיקות API ובדיקת דפדפן. מספרים אלה מתארים את האימות שבוצע, ולא אישור התקנה מתוך clone נקי או מוכנות לייצור.

## מגבלות והגשה

אין כרגע מודל AI אמיתי, התחברות משתמשים, דפדוף תוצאות מלא, היסטוריית הרצות או זיהוי התנגשויות בעריכה. מחיקה קיימת ב־API בלבד. רענון או סגירת לשונית מאבדים טיוטה שלא נשמרה.

מסמכי המגבלות ומעקב הדרישות מפרטים את מה שנותר לבדוק לקראת הגשה. קיום מסמך או בדיקה עם תשובות מדומות אינו מחליף הדגמה חיה של כל השירותים יחד.
