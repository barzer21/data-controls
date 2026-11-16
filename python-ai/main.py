import json
from pathlib import Path

from pydantic import ValidationError

from mock_ai import propose_rule
from models import ProposalRequest


def load_proposal(input_path):
    try:
        request = ProposalRequest.model_validate(
            json.loads(input_path.read_text(encoding="utf-8"))
        )
        return propose_rule(request.description, request.metadata)
    except FileNotFoundError:
        print("Error: request.json was not found next to main.py.")
    except json.JSONDecodeError:
        print("Error: request.json contains invalid JSON. Check quotes and commas.")
    except UnicodeError:
        print("Error: save request.json with UTF-8 encoding.")
    except OSError:
        print("Error: request.json could not be read. Check file permissions.")
    except ValidationError as error:
        print("Error: the request or generated proposal does not match its contract.")
        for issue in error.errors():
            print(" -", ".".join(str(part) for part in issue["loc"]), ":", issue["msg"])
    except ValueError as error:
        print("Error:", error)
    print("No new proposal was created. proposal.json may contain a previous result.")
    return None


def main():
    input_path = Path(__file__).with_name("request.json")
    proposal = load_proposal(input_path)
    if proposal is None:
        return 1

    output_path = Path(__file__).with_name("proposal.json")
    output_path.write_text(
        json.dumps(proposal, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Mock proposal saved. Open python-ai/proposal.json in VS Code.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
