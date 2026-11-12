# Data Controls — Angular frontend

ממשק בעברית וב־RTL. הצעד הראשון כולל רשימת בקרות שמורות ודפדוף דרך השרת, לצד טעינה, שגיאה עם ניסיון חוזר ורשימה ריקה.

קובצי העיצוב כתובים ב־SCSS, כולל העיצוב הגלובלי. זו גם ברירת המחדל ליצירת רכיבים חדשים באמצעות Angular CLI.

## הרצה מקומית

נדרשים Node.js בטווח `^22.22.3 || ^24.15.0 || ^26.0.0` ו־npm. הוראות הקמת המסד נמצאות ב־[README הראשי](../README.md).

בטרמינל ראשון, משורש הפרויקט:

```powershell
dotnet run --project backend/DataControls.Api --launch-profile http
```

בטרמינל נוסף, מתיקייה זו:

```powershell
npm.cmd ci
npm.cmd start
```

פתחו `http://localhost:4200`. קובץ `proxy.conf.json` מעביר בקשות `/api/**` לשרת המקומי בפורט 5037. אחרי שינויו יש להפעיל מחדש את שרת Angular. ה־proxy משמש לפיתוח בלבד; בפריסה נדרש ניתוב API מתאים.

## מבנה ואחריות

- `src/app/core/api`: מודלים ושירותי תקשורת לרשימה ולמטא־דאטה.
- `src/app/features/rules/saved-rules-page`: תיאום הבקשות ומצב המסך באמצעות signals ו־RxJS.
- `src/app/features/rules/saved-rules-list`: הצגת שם, תיאור וסוג נתונים לפי המטא־דאטה, ללא קריאות HTTP.
- `src/app/shared/pagination`: רכיב דפדוף המקבל נתוני עמוד ומחזיר אירוע מעבר.

אין יצירת נתוני דוגמה אוטומטית. בקרות שנשמרו דרך ה־API יופיעו ברשימה; מסד ללא בקרות יציג הודעה מתאימה. הרצה, תוצאות ועורך יתווספו במשימות הבאות.

## בדיקות ובנייה

```powershell
npm.cmd test -- --watch=false
npm.cmd run build
```

הבדיקות משתמשות בשרת HTTP מדומה ואינן דורשות SQL Server. פלט הבנייה נוצר ב־`dist/data-controls/browser`. פירוט הבדיקות מול השרת ובדפדפן נמצא ב־[תיעוד האימות](../docs/FRONTEND_LIST.md).
