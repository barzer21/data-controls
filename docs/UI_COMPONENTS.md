<div dir="rtl">

# ‏מפת קומפוננטות ה־UI

‏התרשים מציג את 18 הקומפוננטות בפרויקט. חץ מציין שההורה מציג את הילד ב־HTML שלו. החצים מ־`AppComponent` לעמודים מייצגים הצגה דרך `router-outlet`. חלק מהרכיבים מוצגים רק בהתאם למצב המסך.

<div dir="ltr">

```mermaid
flowchart TB
    app["AppComponent — מעטפת וניווט"]
    library["SavedRulesPageComponent — ספריית הבקרות"]
    editorPage["RuleEditorPageComponent — עמוד יצירה ועריכה"]
    aiPage["AiRulePageComponent — עמוד יצירה בעזרת AI"]
    resultsPage["RuleResultsPageComponent — עמוד הרצת בקרה שמורה"]
    list["SavedRulesListComponent — רשימת הבקרות"]
    pagination["PaginationComponent — דפדוף בספרייה"]
    creator["AiRuleCreatorComponent — הזנת תיאור וקבלת הצעה"]
    editor["RuleEditorComponent — עריכה, אישור, שמירה והרצת טיוטה"]
    picker["EntityPickerComponent — בחירת הנתונים לבדיקה"]
    conditionEditor["ConditionEditorComponent — עורך תנאים וקבוצות"]
    overview["RuleOverviewComponent — הצגת הגדרת הבקרה"]
    summary["RuleSummaryComponent — סיכום התנאים במילים"]
    condition["RuleConditionComponent — הצגת עץ תנאים"]
    results["RuleResultsComponent — ניהול הרצה, חיפוש וסינון"]
    filters["ResultFiltersComponent — שדות חיפוש וחלונית סינון"]
    table["ExecutionResultsComponent — טבלה, ספירות וסיבות לחריגה"]
    icon["UiIconComponent — אייקונים"]

    app --> library
    app --> editorPage
    app --> aiPage
    app --> resultsPage
    library --> list
    library --> pagination
    editorPage --> editor
    aiPage --> creator
    aiPage --> editor
    editor --> picker
    editor --> conditionEditor
    editor --> overview
    editor --> summary
    editor --> condition
    editor --> results
    overview --> condition
    resultsPage --> condition
    resultsPage --> results
    results --> filters
    results --> table
    conditionEditor --> conditionEditor
    condition --> condition
    picker -.-> icon
    conditionEditor -.-> icon
    editor -.-> icon
    overview -.-> icon
    summary -.-> icon
```

</div>

## ‏העמודים והאחריות שלהם

| ‏עמוד | ‏כתובת | ‏אחריות |
| --- | --- | --- |
| ‏`SavedRulesPageComponent` | ‏`/rules` | ‏טעינת רשימת בקרות ומטא־דאטה, דפדוף וניווט לעריכה ולהרצה |
| ‏`RuleEditorPageComponent` | ‏`/rules/new`, ‏`/rules/:id/edit` | ‏קריאת המזהה מהכתובת, טעינת מטא־דאטה, אירוח העורך וטיפול ביציאה מהעמוד |
| ‏`AiRulePageComponent` | ‏`/rules/ai/new` | ‏תחילה מציג הזנת תיאור; לאחר קבלת הצעה מציג את העורך לבדיקה ואישור |
| ‏`RuleResultsPageComponent` | ‏`/rules/:id/results` | ‏טעינת הבקרה והמטא־דאטה והצגת פרטיה לצד קומפוננטת התוצאות |

## ‏עורך הבקרה

- ‏`RuleEditorComponent` מנהל את הטיוטה, טעינת הבקרה לעריכה, שינויים, אישור הצעת AI, שמירה והרצת טיוטה.
- ‏`EntityPickerComponent` מציג בחירה עסקית של הנתונים שעליהם תתבצע הבקרה.
- ‏`ConditionEditorComponent` עורך השוואות וקבוצות AND/OR. הוא קורא לעצמו כדי לאפשר קבוצות מקוננות.
- ‏`RuleOverviewComponent` מציג את הגדרת הבקרה במצב קריאה בלבד, באמצעות `RuleConditionComponent`.
- ‏`RuleSummaryComponent` מציג סיכום מילולי לצד העריכה; `RuleConditionComponent` מציג את עץ התנאים גם באישור החלפת סוג הנתונים ובתצוגת הטיוטה שהורצה.

## ‏תוצאות בשני תהליכי ההרצה

‏אותה `RuleResultsComponent` מופיעה ישירות מתחת לעורך ובתוך עמוד הרצת הבקרה השמורה. היא מנהלת עותק של הבקרה, מסננים שהוחלו, שליחת בקשות, ביטול בקשות קודמות, טעינה, תוצאות ושגיאות.

- ‏`ResultFiltersComponent` מחזיק את מה שמקלידים בשדות החיפוש והסינון, ומודיע להורה כשמחילים בחירה חדשה.
- ‏`ExecutionResultsComponent` מקבל תוצאה ומציג את הטבלה, הספירות והסיבות לחריגה. לחיצה על כפתור סינון בכותרת עמודה מודיעה להורה לפתוח את חלונית המסננים.
- ‏בטיוטה מועברת תוצאה שכבר התקבלה, ולכן אין הרצה ראשונית נוספת. בעמוד הרצה רגיל הקומפוננטה מקבלת הגדרה ומבצעת את ההרצה הראשונה.
- ‏בפתיחה מחדש או בהחלפת הקלט המסננים מתאפסים. הרס הקומפוננטה מבטל בקשות פעילות. אין שירות ניהול מצב נפרד לתוצאות.

## ‏קוד משותף שאינו קומפוננטה

‏`RulesApiService`, ‏`MetadataApiService` ו־`AiProposalsApiService` אחראים לתקשורת עם השרת. `RuleLibraryNavigationService` מטפל בחזרה לספרייה לאחר שמירה. `BusinessValuePipe` מעצב ערכים עסקיים לתצוגה. פונקציות עזר משותפות מטפלות במודלי התנאים, תרגום מסננים וסיכום הבקרה.

</div>
