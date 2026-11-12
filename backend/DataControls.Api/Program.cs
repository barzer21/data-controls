using DataControls.Api.Data;
using Microsoft.EntityFrameworkCore;
using DataControls.Api.Metadata;
using DataControls.Api.Rules;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers().AddJsonOptions(options =>
{
    // The discriminator is an ordinary JSON property; callers need not put kind first.
    options.JsonSerializerOptions.AllowOutOfOrderMetadataProperties = true;
});
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();
builder.Services.AddSingleton<IMetadataProvider, JsonMetadataProvider>();
builder.Services.AddSingleton<SqlServerMetadataValidator>();
builder.Services.AddSingleton<RuleValidator>();
builder.Services.AddScoped<RuleService>();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<PersistenceExceptionHandler>();

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlServer(builder.Configuration.GetConnectionString("DefaultConnection")));

var app = builder.Build();
app.UseExceptionHandler(new ExceptionHandlerOptions
{
    // Preserve HTTP input errors (notably request-size limits) instead of turning them into 500s.
    StatusCodeSelector = exception => exception is BadHttpRequestException request
        ? request.StatusCode : StatusCodes.Status500InternalServerError
});

// Fail before accepting requests if the catalog is invalid or does not match the database.
var metadata = app.Services.GetRequiredService<IMetadataProvider>();
using (var validationTimeout = new CancellationTokenSource(TimeSpan.FromSeconds(30)))
{
    await app.Services.GetRequiredService<SqlServerMetadataValidator>()
        .ValidateAsync(metadata.Catalog, validationTimeout.Token);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
