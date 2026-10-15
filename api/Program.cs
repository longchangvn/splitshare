using System.Text;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Data.Providers;
using SplitShare.Api.Endpoints;
using SplitShare.Api.Expenses;
using SplitShare.Api.Groups;
using SplitShare.Api.Payments;
using SplitShare.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults(); // Aspire: OTel, resilience, service discovery (no-op standalone)

builder.Services.AddOpenApi();
builder.Services.ConfigureHttpJsonOptions(o =>
{
    // Property names only: dictionary keys (user ids, hashes, emails) must pass through untouched.
    o.SerializerOptions.PropertyNamingPolicy = new SnakeCaseNamingPolicy();
});
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:3000"])
     .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var provider = DatabaseProviderFactory.Create(builder.Configuration);
var conn = builder.Configuration[provider.ConnectionKey]
    ?? builder.Configuration.GetConnectionString("module-platform")
    ?? builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5433;Database=module_platform;Username=module_platform;Password=module_platform";
builder.Services.AddSingleton<IDatabaseProvider>(provider);
builder.Services.AddDbContext<AppDbContext>(o => provider.Configure(o, conn));
builder.Services.AddScoped<LedgerService>();
builder.Services.AddScoped<IdempotencyService>();
builder.Services.AddScoped<TokenService>();
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<GroupService>();
builder.Services.AddScoped<ExpenseService>();
builder.Services.AddScoped<PaymentService>();
builder.Services.AddSingleton<IFileStore, LocalFileStore>();
builder.Services.AddHttpClient<GoogleVerifier>();
builder.Services.AddSingleton<IEmailSender, StubEmailSender>();

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
    app.MapOpenApi("/openapi.json");

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

var api = v1.MapGroup("/").RequireAuthorization(); // everything else needs JWT (task 3.4)
SettlementEndpoints.Map(api);
AuthEndpoints.MapAccount(api);
GroupEndpoints.Map(api);
ExpenseEndpoints.Map(api);
PaymentEndpoints.Map(api);
LedgerEndpoints.Map(api);

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
