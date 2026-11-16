"""Read-only checks against a temporary API process and the existing development DB."""

from datetime import date, datetime, timezone
import os
from pathlib import Path
import subprocess
import tempfile

from check_ai_integration import call, free_port, stop, wait_ready


def comparison(field, operator, value=None):
    node = {"kind": "comparison", "left": {"fieldId": field}, "operator": operator}
    if operator not in ("isNull", "isNotNull"):
        node["right"] = {"kind": "constant", "value": value}
    return node


def main():
    root = Path(__file__).resolve().parents[2]
    api_root = root / "backend/DataControls.Api"
    dll = api_root / "bin/Release/net10.0/DataControls.Api.dll"
    url = f"http://127.0.0.1:{free_port()}"
    environment = {**os.environ, "ASPNETCORE_ENVIRONMENT": "Development"}
    process = None
    with tempfile.TemporaryDirectory(prefix="data-controls-age-") as temporary:
        with open(Path(temporary) / "api.log", "w", encoding="utf-8") as log:
            try:
                process = subprocess.Popen(
                    ["dotnet", str(dll), "--contentRoot", str(api_root), "--urls", url],
                    env=environment, stdout=log, stderr=log,
                    creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                )
                wait_ready(url + "/api/metadata", process)
                status, metadata = call(url + "/api/metadata")
                employee = next(entity for entity in metadata["entities"] if entity["id"] == "employee")
                assert next(field for field in employee["fields"] if field["id"] == "age")["type"] == "number"
                assert not any(key in str(metadata) for key in ("calculation", "sourceFieldId", "BirthDate"))
                print("PASS: startup schema validation and public age metadata.")

                def execute(condition, filter_node=None):
                    body = {"definition": {"name": "Age API check", "rootEntityId": "employee", "condition": condition}}
                    if filter_node:
                        body["options"] = {"filter": filter_node}
                    status, result = call(url + "/api/rules/execute?limit=100", body)
                    assert status == 200, result
                    assert any(column["id"] == "age" and column["type"] == "number" for column in result["columns"])
                    assert result["evaluatedCount"] >= result["totalCount"]
                    return result

                all_rows = execute({"kind": "group", "operator": "or", "children": [
                    comparison("firstName", "isNull"), comparison("firstName", "isNotNull")
                ]})
                root_count = all_rows["evaluatedCount"]
                assert root_count == all_rows["totalCount"]
                result = execute(comparison("birthDate", "isNotNull"))
                assert result["records"], "Expected development fixture employees with birth dates."
                today = datetime.now(timezone.utc).date()
                for row in result["records"]:
                    birth = date.fromisoformat(row["values"]["birthDate"])
                    try:
                        birthday = birth.replace(year=today.year)
                    except ValueError:
                        birthday = date(today.year, 2, 28)
                    expected = None if birth > today else today.year - birth.year - (birthday > today)
                    assert row["values"]["age"] == expected
                print("PASS: actual API rows include correctly calculated age.")

                result = execute(comparison("age", "greaterThanOrEqual", 18))
                assert all(row["values"]["age"] >= 18 for row in result["records"])
                assert all(row["explanation"]["left"]["fieldId"] == "age" and
                           row["explanation"]["left"]["value"] == row["values"]["age"] for row in result["records"])
                print("PASS: age rule and explanations use actual computed values.")

                filtered = execute(comparison("birthDate", "isNotNull"), comparison("age", "lessThan", 40))
                assert all(row["values"]["age"] < 40 for row in filtered["records"])
                assert all(row["explanation"]["left"]["fieldId"] == "birthDate" for row in filtered["records"])
                print("PASS: numeric result filter preserves the original failure explanation.")
                assert filtered["evaluatedCount"] == root_count
                zero = execute(comparison("age", "lessThan", -1))
                assert zero["totalCount"] == 0 and zero["evaluatedCount"] == root_count
                status, departments = call(url + "/api/rules/execute", {"definition": {
                    "name": "Department count", "rootEntityId": "department", "condition": {
                        "kind": "group", "operator": "or", "children": [
                            comparison("name", "isNull"), comparison("name", "isNotNull")
                        ]
                    }
                }})
                assert status == 200 and departments["evaluatedCount"] == departments["totalCount"]
                print("PASS: evaluated count ignores filters, survives zero matches and follows the selected entity.")
                print("All age API checks passed; no saved rules or database records were changed.")
            except Exception:
                log.flush()
                print((Path(temporary) / "api.log").read_text(encoding="utf-8"))
                raise
            finally:
                stop(process)


if __name__ == "__main__":
    main()
