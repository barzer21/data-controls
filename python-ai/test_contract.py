import copy
import json
from pathlib import Path
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from pydantic import ValidationError

from api import create_proposal
from metadata_validation import validate_proposal_references
from models import ConstantOperand, ProposalRequest, RuleProposal


ROOT = Path(__file__).resolve().parents[1]


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.request = ProposalRequest.model_validate_json(
            (ROOT / "python-ai/request.json").read_text(encoding="utf-8")
        )

    def test_shared_dotnet_contract_cases(self):
        cases = json.loads((ROOT / "backend/tests/fixtures/rule-contract.json").read_text())
        for case in cases:
            with self.subTest(case=case["name"]):
                try:
                    proposal = RuleProposal.model_validate(case["definition"])
                    validate_proposal_references(proposal.model_dump(), self.request.metadata)
                    accepted = True
                except ValueError:
                    accepted = False
                self.assertEqual(case["valid"], accepted)

    def test_constant_types_are_preserved(self):
        for value in [True, False, 1, 1.25, "1"]:
            with self.subTest(value=value):
                result = ConstantOperand(kind="constant", value=value).value
                self.assertIs(type(value), type(result))
                self.assertEqual(value, result)

    def test_non_finite_constants_are_rejected(self):
        for value in [float("nan"), float("inf"), float("-inf")]:
            with self.subTest(value=value), self.assertRaises(ValidationError):
                ConstantOperand(kind="constant", value=value)

    def test_request_and_metadata_reject_extra_fields_and_coercion(self):
        for location, key, value in [
            ([], "unexpected", True),
            (["metadata"], "schema", "dbo"),
            (["metadata", "entities", 0], "table", "Employees"),
            (["metadata", "entities", 0, "fields", 0], "column", "Name"),
            (["metadata", "relationships", 0], "fromColumn", "DepartmentId"),
            (["metadata"], "version", "1"),
            ([], "description", 123),
        ]:
            with self.subTest(location=location, key=key):
                request = copy.deepcopy(self.request.model_dump())
                target = request
                for segment in location:
                    target = target[segment]
                target[key] = value
                with self.assertRaises(ValidationError):
                    ProposalRequest.model_validate(request)

    def test_invalid_generated_output_is_server_error(self):
        with patch("mock_ai.RuleProposal.model_validate", side_effect=ValidationError.from_exception_data("RuleProposal", [])):
            with self.assertRaises(HTTPException) as caught:
                create_proposal(self.request)
        self.assertEqual(500, caught.exception.status_code)
        self.assertEqual("The generated proposal is invalid.", caught.exception.detail)


if __name__ == "__main__":
    unittest.main()
