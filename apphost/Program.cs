// Local dev orchestration: Aspire dashboard + API + web against the existing
// Postgres on localhost:5433. Production stays on docker-compose.yml.
using Microsoft.Extensions.Configuration;

var builder = DistributedApplication.CreateBuilder(args);

// Existing database (user data lives here). Override via
// ConnectionStrings__module-platform in this process environment.
// NOTE: referenced via explicit env (not WithReference): a literal
// AddConnectionString value silently drops the executable from DCP publish
// on Aspire 9.5.2, while the env var produces identical runtime config.
var cs = builder.Configuration.GetConnectionString("module_platform")
    ?? builder.Configuration.GetConnectionString("module-platform")
    ?? "Host=localhost;Port=5433;Database=module_platform;Username=module_platform;Password=module_platform";

var api = builder.AddExecutable("api", "dotnet", "../api", "run", "--project", ".")
    .WithHttpEndpoint(targetPort: 5079, name: "http") // api launch profile "http"
    .WithHttpHealthCheck("/health")
    .WithEnvironment("ASPNETCORE_ENVIRONMENT", "Development")
    .WithEnvironment("ConnectionStrings__module-platform", cs);

// Web has no Aspire.JavaScript package on this SDK generation: run the Vite
// dev server as a plain executable on the fixed port the API CORS allows.
var web = builder.AddExecutable("web", "npm", "../web", "run", "dev")
    .WithHttpEndpoint(targetPort: 5173, name: "vite")
    .WithEnvironment("VITE_API_URL", api.GetEndpoint("http"));

builder.Build().Run();
