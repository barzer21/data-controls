<div dir="rtl">

# ‏דוגמאות לבקרות

‏הדוגמאות הן הגדרות עסקיות גנריות. הן ניתנות ליצירה בעורך ללא כתיבת SQL. תנאי שמתקיים מסמן חריגה. קובצי JSON מצורפים כדי לאפשר אימות והרצה חוזרים דרך ה־API.

| ‏דוגמה | ‏ישות | ‏תנאי חריגה | ‏קובץ |
| --- | --- | --- | --- |
| ‏עובדים צעירים עם שכר גבוה | ‏עובדים | ‏גיל קטן מ־18 וגם שכר גדול מ־15,000 | ‏[young-high-salary.json](examples/young-high-salary.json) |
| ‏תאריכי העסקה לא תקינים | ‏עובדים | ‏סיום העסקה מוקדם מתחילת העסקה | ‏[employment-dates.json](examples/employment-dates.json) |
| ‏עובד פעיל במחלקה לא פעילה | ‏עובדים | ‏עובד פעיל וגם המחלקה המשויכת אינה פעילה | ‏[inactive-department.json](examples/inactive-department.json) |
| ‏פרטי עובד חסרים | ‏עובדים | ‏תאריך תחילת העסקה חסר או שיוך למחלקה חסר | ‏[missing-employee-data.json](examples/missing-employee-data.json) |
| ‏מחלקה פעילה ללא מנהל | ‏מחלקות | ‏המחלקה פעילה ושם המנהל חסר | ‏[department-without-manager.json](examples/department-without-manager.json) |

‏גיל מחושב ביחס למועד ההרצה, ולכן מספר התוצאות בדוגמה הראשונה יכול להשתנות עם הזמן. אין להסיק שתמיד יוחזר מספר קבוע. תאריך חסר אינו מקיים השוואת סדר רגילה.

‏בדוגמת המחלקה הלא פעילה, עובד ללא מחלקה אינו שקול לעובד במחלקה שהערך שלה הוא `false`. כדי לאתר קשר חסר אפשר להשתמש בבדיקת `isNull` בשדה קשור.

## ‏בדיקה דרך הממשק

1. ‏בחרו „יצירת בקרה חדשה” בסרגל הצד.
2. ‏בחרו עובדים או מחלקות, הגדירו את התנאים והוסיפו שם.
3. ‏עברו ל״הצגת הבקרה״ כדי לבדוק את המבנה והמשמעות.
4. ‏לחצו „הרצה” כדי לבדוק טיוטה בלי לשמור, או „שמירת בקרה” כדי לשמור ולחזור לספרייה.
5. ‏בתוצאות אפשר לסנן לפי גיל ושדות נוספים. הסיכום מציג חריגות תואמות מתוך כלל רשומות הישות.

## ‏בדיקה דרך ה־API

‏אחרי הפעלת הבקאנד, משורש הפרויקט ב־PowerShell:

<div dir="ltr">

```powershell
$definition = Get-Content .\docs\examples\young-high-salary.json -Raw -Encoding UTF8 | ConvertFrom-Json
$json = $definition | ConvertTo-Json -Depth 20
Invoke-RestMethod http://localhost:5037/api/rules/validate `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($json))

$execution = @{ definition = $definition } | ConvertTo-Json -Depth 20
Invoke-RestMethod 'http://localhost:5037/api/rules/execute?limit=100' `
  -Method Post -ContentType 'application/json; charset=utf-8' `
  -Body ([Text.Encoding]::UTF8.GetBytes($execution))
```

</div>

‏שתי הבקשות אינן שומרות בקרה. שמירה מפורשת נעשית עם `POST /api/rules` וגוף ההגדרה עצמו, ללא מעטפת `definition`.

‏להפעלת הדוגמאות המובנות של AI ראו [הדגמת יצירת בקרה בעזרת AI](../README.md#ai-demo). רשימת הנוסחים נטענת מ־`mock_ai.py` ומוצגת בממשק. חמש הדוגמאות במסמך הזה אינן רשימת הנוסחים הנתמכים ב־mock.

‏אימות בתאריך 2026-11-16: כל חמש ההגדרות עברו `POST /api/rules/validate` והרצת טיוטה דרך API זמני מול דאטה בייס הפיתוח. לא נשמרו בקרות ולא שונו נתונים. זו בדיקת API, ולא הדגמת יצירה ידנית של הדוגמאות בדפדפן.

</div>
