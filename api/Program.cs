using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Data.Providers;
using SplitShare.Api.Endpoints;
using SplitShare.Api.Expenses;
using SplitShare.Api.Groups;
using SplitShare.Api.Notifications;
using SplitShare.Api.Payments;
using SplitShare.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults(); // Aspire: OTel, resilience, service discovery (no-op standalone)

builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer<BearerSecuritySchemeTransformer>();
    options.AddOperationTransformer<AuthOperationTransformer>();
});
builder.Services.ConfigureHttpJsonOptions(o =>
{
    // Property names only: dictionary keys (user ids, hashes, emails) must pass through untouched.
    o.SerializerOptions.PropertyNamingPolicy = new SnakeCaseNamingPolicy();
});
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"])
     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

// Connection string is environment-only: Database:Provider key (env var
// Database__<Provider>) first, then the legacy ConnectionStrings keys (still
// supported as env-only overrides, e.g. by the Aspire AppHost).
var provider = DatabaseProviderFactory.Create(builder.Configuration);
var conn = builder.Configuration[provider.ConnectionKey]
    ?? builder.Configuration.GetConnectionString("module-platform")
    ?? builder.Configuration.GetConnectionString("Default");
if (string.IsNullOrWhiteSpace(conn))
    throw new InvalidOperationException(
        $"No connection string for provider '{provider.Name}'. " +
        $"Set the {provider.ConnectionKey.Replace(":", "__")} environment variable " +
        "(compose/Container Apps env, or `dotnet user-secrets set` for local dev). " +
        "Connection strings are no longer read from appsettings*.json.");
builder.Services.AddSingleton<IDatabaseProvider>(provider);
builder.Services.AddDbContext<AppDbContext>(o => provider.Configure(o, conn));
builder.Services.AddScoped<LedgerService>();
builder.Services.AddScoped<IdempotencyService>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GroupService>();
builder.Services.AddScoped<GroupStatusPolicy>();
builder.Services.AddScoped<CategoryService>();
builder.Services.AddScoped<ExpenseService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddScoped<RecurringService>();
// Receipt OCR: Ocr:Provider "ollama" = local Ollama vision model, else disabled stub.
if (string.Equals(builder.Configuration["Ocr:Provider"], "ollama", StringComparison.OrdinalIgnoreCase))
{
    var ocrTimeout = TimeSpan.FromSeconds(builder.Configuration.GetValue("Ocr:TimeoutSeconds", 60));
    builder.Services.AddHttpClient(OllamaOcrService.HttpClientName, c =>
    {
        c.BaseAddress = new Uri(builder.Configuration["Ocr:BaseUrl"] ?? "http://localhost:11434/");
        c.Timeout = ocrTimeout + TimeSpan.FromSeconds(5);
    });
    // Service defaults add the standard resilience handler (10 s attempt / 3 retries) to every client;
    // one OCR inference can exceed that and retrying re-runs the model, so allow one long attempt.
    builder.Services.Configure<Microsoft.Extensions.Http.Resilience.HttpStandardResilienceOptions>(
        $"{OllamaOcrService.HttpClientName}-standard", o =>
        {
            o.Retry.ShouldHandle = _ => ValueTask.FromResult(false);
            o.AttemptTimeout.Timeout = ocrTimeout;
            o.TotalRequestTimeout.Timeout = ocrTimeout;
            o.CircuitBreaker.SamplingDuration = ocrTimeout * 2;
        });
    builder.Services.AddSingleton<IOcrService, OllamaOcrService>();
}
else builder.Services.AddSingleton<IOcrService, DisabledOcrService>();
builder.Services.AddSingleton<IFileStore, LocalFileStore>();
builder.Services.AddHttpClient<GoogleVerifier>();
builder.Services.AddSingleton<IEmailSender, StubEmailSender>();
// Push notifications (add-onesignal-group-notifications): provider is config-driven
// (Notification:Provider — unset = null provider, "onesignal" = OneSignal REST).
builder.Services.AddHttpClient(OneSignalProvider.HttpClientName, c => c.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddSingleton<INotificationProvider>(sp => NotificationProviderFactory.Create(
    builder.Configuration,
    sp.GetRequiredService<IHttpClientFactory>(),
    sp.GetRequiredService<ILogger<OneSignalProvider>>(),
    sp.GetRequiredService<ILogger<NullNotificationProvider>>()));
builder.Services.AddScoped<GroupNotifier>();

// --- Auth (tasks 3.1-3.4): JWT access (15 min) + opaque rotating refresh (30 d).
var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey) || jwtKey.Length < 32)
{
    if (builder.Environment.IsDevelopment())
    {
        jwtKey = "dev-only-insecure-key-change-in-prod-0123456789";
        Console.WriteLine("WARN: Jwt:Key missing/short; using insecure dev key. Set Jwt__Key in prod.");
    }
    else throw new InvalidOperationException("Jwt:Key missing or too short (>=32 chars).");
}
builder.Configuration["Jwt:Key"] = jwtKey; // TokenService reads from config
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false; // keep "sub"/"email" as-is (no legacy ClaimTypes mapping)
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = TokenService.Issuer,
            ValidAudience = TokenService.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();

// 5 req/min per IP on auth endpoints (spec task 3.1). Rejections are 429.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("auth-ip", ctx =>
    RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5, Window = TimeSpan.FromMinutes(1), QueueLimit = 0
        }));
});

var app = builder.Build();

// Standard error envelope for unhandled failures (spec §9).
app.UseExceptionHandler(err => err.Run(async ctx =>
{
    var logger = ctx.RequestServices.GetRequiredService<ILogger<Program>>();
    var feature = ctx.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>();
    // Malformed JSON bodies (e.g. bad guid/type) are client errors, not 500s.
    if (feature?.Error is BadHttpRequestException bad)
    {
        ctx.Response.StatusCode = StatusCodes.Status422UnprocessableEntity;
        await ctx.Response.WriteAsJsonAsync(new ErrorResponse("VALIDATION", "Malformed request body."));
        return;
    }
    logger.LogError("Unhandled exception on {Path}", ctx.Request.Path);
    ctx.Response.StatusCode = StatusCodes.Status500InternalServerError;
    await ctx.Response.WriteAsJsonAsync(new ErrorResponse("INTERNAL", "Unexpected error."));
}));

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi("/openapi.json");
    app.MapOpenApi(); // default /openapi/v1.json — consumed by Scalar below
    app.MapScalarApiReference(o => o
        .WithTitle("SplitShare API")
        .WithOpenApiRoutePattern("/openapi/{documentName}.json"));
}

app.UseCors();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
// NOTE: no HTTPS redirection in Docker (TLS terminates at proxy). Enable in prod with certs.
// app.UseHttpsRedirection();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "splitshare-api", time = DateTime.UtcNow }));

app.MapGet("/db-ping", async (AppDbContext db) =>
{
    try
    {
        var ok = await db.Database.CanConnectAsync();
        return ok
            ? Results.Ok(new { status = "ok", db = "reachable" })
            : Results.Json(new ErrorResponse("UNAVAILABLE", "Database unreachable."),
                statusCode: StatusCodes.Status503ServiceUnavailable);
    }
    catch
    {
        return Results.Json(new ErrorResponse("UNAVAILABLE", "Database unreachable."),
            statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

var v1 = app.MapGroup("/api/v1");
v1.MapGet("/health", () => Results.Ok(new { status = "ok", service = "splitshare-api", time = DateTime.UtcNow }));
AuthEndpoints.Map(v1); // public: auth/* (rate-limited)
GroupEndpoints.MapPublic(v1); // public: invite preview for /g/:token landing (anonymous)
TripPackEndpoints.MapPublic(v1); // public: capabilities + shared links (anonymous)

var api = v1.MapGroup("/").RequireAuthorization(); // everything else needs JWT (task 3.4)
SettlementEndpoints.Map(api);
AuthEndpoints.MapAccount(api);
GroupEndpoints.Map(api);
ExpenseEndpoints.Map(api);
PaymentEndpoints.Map(api);
LedgerEndpoints.Map(api);
RecurringEndpoints.Map(api);
TripPackEndpoints.Map(api);

// Migrations own the schema (task 1.2); startup stays up when DB is down.
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    try
    {
        await db.Database.MigrateAsync();
        logger.LogInformation("DB Migrate OK: {Conn}", Mask(conn));
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "DB not reachable at startup ({Conn}). API still serves /health; /db-ping returns 503.", Mask(conn));
    }
}

app.Run();

static string Mask(string c) =>
    System.Text.RegularExpressions.Regex.Replace(c, @"Password=[^;]+", "Password=***", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
