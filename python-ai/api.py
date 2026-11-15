from fastapi import FastAPI, HTTPException
from mock_ai import propose_rule
from models import ProposalRequest, RuleProposal


app = FastAPI(title="Data Controls - Mock AI")


@app.post("/proposals", response_model=RuleProposal, response_model_exclude_unset=True)
def create_proposal(request: ProposalRequest):
    try:
        return propose_rule(request.description, request.metadata)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
