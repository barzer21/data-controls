using DataControls.Api.Rules;
using DataControls.Api.Contracts;
using Microsoft.AspNetCore.Mvc;

namespace DataControls.Api.Controllers;

[ApiController]
[Route("api/rules")]
public sealed class RulesController(RuleValidator validator, RuleService rules) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<RuleListResponse>> List(CancellationToken cancellationToken,
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20)
    {
        if (page < 1 || pageSize is < 1 or > 100 || (long)(page - 1) * pageSize > int.MaxValue)
            return Problem(statusCode: 400, title: "יש לבחור עמוד חיובי וגודל עמוד בין 1 ל־100.");
        return Ok(await rules.ListAsync(page, pageSize, cancellationToken));
    }

    [HttpGet("{id:int:min(1)}")]
    public async Task<ActionResult<SavedRuleResponse>> Get(int id, CancellationToken cancellationToken)
    {
        var rule = await rules.GetAsync(id, cancellationToken);
        return rule is null ? NotFoundRule() : Ok(rule);
    }

    [HttpPost]
    [RequestSizeLimit(64 * 1024)]
    public async Task<ActionResult<SavedRuleResponse>> Create(RuleDefinition definition, CancellationToken cancellationToken)
    {
        var result = await rules.SaveAsync(null, definition, cancellationToken);
        if (!result.Validation.IsValid) return BadRequest(result.Validation);
        return CreatedAtAction(nameof(Get), new { id = result.Rule!.Id }, result.Rule);
    }

    [HttpPut("{id:int:min(1)}")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<ActionResult<SavedRuleResponse>> Update(int id, RuleDefinition definition,
        CancellationToken cancellationToken)
    {
        var result = await rules.SaveAsync(id, definition, cancellationToken);
        if (!result.Validation.IsValid) return BadRequest(result.Validation);
        return result.Rule is null ? NotFoundRule() : Ok(result.Rule);
    }

    [HttpDelete("{id:int:min(1)}")]
    public async Task<IActionResult> Delete(int id, CancellationToken cancellationToken) =>
        await rules.DeleteAsync(id, cancellationToken) ? NoContent() : NotFoundRule();

    [HttpPost("validate")]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType<RuleValidationResult>(StatusCodes.Status200OK)]
    [ProducesResponseType<RuleValidationResult>(StatusCodes.Status400BadRequest)]
    public ActionResult<RuleValidationResult> Validate(RuleDefinition rule)
    {
        var result = validator.Validate(rule);
        return result.IsValid ? Ok(result) : BadRequest(result);
    }

    private ObjectResult NotFoundRule() => Problem(statusCode: 404, title: "הבקרה לא נמצאה.");
}
