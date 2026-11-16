using System.Net;
using System.Text.Json;
using DataControls.Api.Ai;
using DataControls.Api.Contracts;
using DataControls.Api.Rules;
using Microsoft.AspNetCore.Mvc;

namespace DataControls.Api.Controllers;

[ApiController]
[Route("api/ai/proposals")]
public sealed class AiProposalsController(
    IAiRuleProposalProvider proposals,
    ILogger<AiProposalsController> logger) : ControllerBase
{
    [HttpGet("examples")]
    public async Task<ActionResult<IReadOnlyList<string>>> Examples(CancellationToken cancellationToken)
    {
        try
        {
            return Ok(await proposals.GetExamplesAsync(cancellationToken));
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Problem(statusCode: 504, title: "טעינת הדוגמאות חרגה מזמן ההמתנה.");
        }
        catch (JsonException error)
        {
            logger.LogWarning(error, "AI service returned invalid examples.");
            return Problem(statusCode: 502, title: "שירות ההצעות החזיר רשימת דוגמאות לא תקינה.");
        }
        catch (HttpRequestException error)
        {
            logger.LogWarning(error, "AI examples service is unavailable.");
            return Problem(statusCode: 503, title: "לא ניתן לטעון כרגע את דוגמאות הבקרות.");
        }
    }

    [HttpPost]
    [RequestSizeLimit(64 * 1024)]
    [ProducesResponseType<RuleDefinition>(StatusCodes.Status200OK)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status400BadRequest)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status502BadGateway)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status503ServiceUnavailable)]
    [ProducesResponseType<ProblemDetails>(StatusCodes.Status504GatewayTimeout)]
    public async Task<ActionResult<RuleDefinition>> Create(AiProposalRequest request,
        CancellationToken cancellationToken)
    {
        try
        {
            var result = await proposals.ProposeAsync(request.Description!, cancellationToken);
            if (!result.Validation.IsValid)
            {
                logger.LogWarning("AI proposal failed rule validation with {ErrorCount} errors.",
                    result.Validation.Errors.Count);
                return InvalidProposal();
            }
            return Ok(result.Definition);
        }
        catch (HttpRequestException error) when (error.StatusCode == HttpStatusCode.BadRequest)
        {
            return Problem(statusCode: 400,
                title: "לא ניתן ליצור הצעה לתיאור הזה. נסו להשתמש באחת מדוגמאות ההדגמה.");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return Problem(statusCode: 504,
                title: "יצירת ההצעה חרגה מזמן ההמתנה. אפשר לנסות שוב.");
        }
        catch (JsonException error)
        {
            logger.LogWarning(error, "AI service returned an invalid proposal response.");
            return InvalidProposal();
        }
        catch (HttpRequestException error) when (error.StatusCode is >= HttpStatusCode.BadRequest
            and < HttpStatusCode.InternalServerError)
        {
            logger.LogWarning(error, "AI service rejected the proposal request.");
            return InvalidProposal();
        }
        catch (HttpRequestException error)
        {
            logger.LogWarning(error, "AI service is unavailable.");
            return Problem(statusCode: 503,
                title: "שירות יצירת ההצעות אינו זמין כרגע. בדקו שהוא פועל ונסו שוב.");
        }
    }

    private ObjectResult InvalidProposal() => Problem(statusCode: 502,
        title: "שירות ההצעות החזיר הצעת בקרה לא תקינה. אפשר לנסות שוב.");
}
