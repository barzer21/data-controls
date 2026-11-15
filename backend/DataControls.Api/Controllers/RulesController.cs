using DataControls.Api.Rules;
using DataControls.Api.Contracts;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace DataControls.Api.Controllers;

[ApiController]
[Route("api/rules")]
public sealed class RulesController(RuleValidator validator, RuleService rules, RuleExecutionService execution) : ControllerBase
{
    [HttpPost("execute")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<ActionResult<RuleExecutionResponse>> ExecuteDraft(DraftRuleExecutionRequest request,
        CancellationToken cancellationToken, [FromQuery] int limit = 100)
    {
        if (limit is < 1 or > RuleExecutor.MaxLimit) return InvalidLimit();
        if (request.Definition is null)
            return BadRequest(new RuleValidationResult(false,
                [new("definition", "requiredDefinition", "יש לספק הגדרת בקרה להרצה.")]));
        var result = await execution.ExecuteAsync(request.Definition, limit, cancellationToken, request.Options);
        return result.Validation.IsValid ? Ok(result.Result) : BadRequest(result.Validation);
    }

    [HttpPost("{id:int:min(1)}/execute")]
    [RequestSizeLimit(64 * 1024)]
    public async Task<ActionResult<RuleExecutionResponse>> ExecuteSaved(int id,
        [FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] SavedRuleExecutionRequest? request,
        CancellationToken cancellationToken, [FromQuery] int limit = 100)
    {
        if (limit is < 1 or > RuleExecutor.MaxLimit) return InvalidLimit();
        var saved = await rules.GetAsync(id, cancellationToken);
        if (saved is null) return NotFoundRule();
        var result = await execution.ExecuteAsync(saved.Definition, limit, cancellationToken, request?.Options);
        return result.Validation.IsValid ? Ok(result.Result) : BadRequest(result.Validation);
    }

    private ObjectResult InvalidLimit() => Problem(statusCode: 400, title: "מספר הרשומות להצגה חייב להיות בין 1 ל־500.");

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
    public async Task<ActionResult<SavedRuleResponse>> Create(RuleDefinition definition, CancellationToken cancellationToken,
        [FromQuery] bool createdWithAi = false)
    {
        var result = await rules.SaveAsync(null, definition, cancellationToken, createdWithAi);
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
