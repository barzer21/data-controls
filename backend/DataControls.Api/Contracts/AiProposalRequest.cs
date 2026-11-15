using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace DataControls.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record AiProposalRequest(
    [Required(ErrorMessage = "יש להזין תיאור לבקרה.")]
    [StringLength(2000, ErrorMessage = "תיאור הבקרה מוגבל ל־2,000 תווים.")]
    string? Description);
