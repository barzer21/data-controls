using DataControls.Api.Rules;
using Microsoft.AspNetCore.Mvc;

namespace DataControls.Api.Controllers;

[ApiController]
[Route("api/rules")]
public sealed class RulesController(RuleValidator validator) : ControllerBase
{
    [HttpPost("validate")]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType<RuleValidationResult>(StatusCodes.Status200OK)]
    [ProducesResponseType<RuleValidationResult>(StatusCodes.Status400BadRequest)]
    public ActionResult<RuleValidationResult> Validate(RuleDefinition rule)
    {
        var result = validator.Validate(rule);
        return result.IsValid ? Ok(result) : BadRequest(result);
    }
}
