using DataControls.Api.Contracts;
using DataControls.Api.Metadata;
using Microsoft.AspNetCore.Mvc;

namespace DataControls.Api.Controllers;

[ApiController]
[Route("api/metadata")]
public sealed class MetadataController(IMetadataProvider metadata) : ControllerBase
{
    [HttpGet]
    public ActionResult<MetadataResponse> Get() => MetadataResponse.FromCatalog(metadata.Catalog);
}
