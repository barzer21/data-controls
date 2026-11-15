from metadata_validation import validate_proposal_references


def propose_rule(description, metadata):
    if not isinstance(description, str) or not description.strip():
        raise ValueError("description must be a non-empty string.")

    description = description.strip()

    # Mock: only these exact descriptions are supported.
    if description == "מצאי עובדים שתאריך סיום ההעסקה שלהם מוקדם מתאריך תחילת ההעסקה.":
        name = "תקינות תאריכי העסקה"
        condition = {
            "kind": "comparison",
            "left": {"fieldId": "endDate"},
            "operator": "lessThan",
            "right": {
                "kind": "field",
                "field": {"fieldId": "startDate"},
            },
        }
    elif description == "מצאי עובדים שהשכר שלהם גבוה מ-15000.":
        name = "בדיקת שכר חריג"
        condition = {
            "kind": "comparison",
            "left": {"fieldId": "salary"},
            "operator": "greaterThan",
            "right": {
                "kind": "constant",
                "value": 15000,
            },
        }
    elif description == "מצאי עובדים פעילים שהשכר שלהם גבוה מ-15000.":
        name = "בדיקת שכר לעובדים פעילים"
        condition = {
            "kind": "group",
            "operator": "and",
            "children": [
                {
                    "kind": "comparison",
                    "left": {"fieldId": "isActive"},
                    "operator": "equals",
                    "right": {"kind": "constant", "value": True},
                },
                {
                    "kind": "comparison",
                    "left": {"fieldId": "salary"},
                    "operator": "greaterThan",
                    "right": {"kind": "constant", "value": 15000},
                },
            ],
        }
    elif description == "מצאי עובדים פעילים שהמחלקה שלהם לא פעילה.":
        name = "עובדים פעילים במחלקה לא פעילה"
        condition = {
            "kind": "group",
            "operator": "and",
            "children": [
                {
                    "kind": "comparison",
                    "left": {"fieldId": "isActive"},
                    "operator": "equals",
                    "right": {"kind": "constant", "value": True},
                },
                {
                    "kind": "comparison",
                    "left": {
                        "fieldId": "isActive",
                        "relationshipPath": ["employeeDepartment"],
                    },
                    "operator": "equals",
                    "right": {"kind": "constant", "value": False},
                },
            ],
        }
    elif description == "מצאי עובדים שחסר להם שם פרטי או שכר.":
        name = "שלמות פרטי עובד"
        condition = {
            "kind": "group",
            "operator": "or",
            "children": [
                {
                    "kind": "comparison",
                    "left": {"fieldId": "firstName"},
                    "operator": "isNull",
                },
                {
                    "kind": "comparison",
                    "left": {"fieldId": "salary"},
                    "operator": "isNull",
                },
            ],
        }
    else:
        raise ValueError("This description is not supported by the mock. See README.md for examples.")

    proposal = {
        "name": name,
        "description": description,
        "rootEntityId": "employee",
        "condition": condition,
    }
    validate_proposal_references(proposal, metadata)
    return proposal
