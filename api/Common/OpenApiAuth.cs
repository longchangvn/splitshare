using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;

namespace SplitShare.Api.Common;

/// <summary>Adds the JWT Bearer scheme so Scalar (and any consumer) can authorize requests.</summary>
internal sealed class BearerSecuritySchemeTransformer : IOpenApiDocumentTransformer
{
    public Task TransformAsync(OpenApiDocument document, OpenApiDocumentTransformerContext context, CancellationToken cancellationToken)
    {
        document.Components ??= new OpenApiComponents();
        document.Components.SecuritySchemes ??= new Dictionary<string, IOpenApiSecurityScheme>();
        document.Components.SecuritySchemes["Bearer"] = new OpenApiSecurityScheme
        {
            Type = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description = "Paste the access token from login/register/refresh (no 'Bearer ' prefix needed in Scalar).",
        };
        return Task.CompletedTask;
    }
}

/// <summary>Marks JWT-protected operations with the Bearer requirement + 401/403 responses.</summary>
internal sealed class AuthOperationTransformer : IOpenApiOperationTransformer
{
    public Task TransformAsync(OpenApiOperation operation, OpenApiOperationTransformerContext context, CancellationToken cancellationToken)
    {
        if (!context.Description.ActionDescriptor.EndpointMetadata.OfType<IAuthorizeData>().Any())
            return Task.CompletedTask;

        operation.Security ??= [];
        operation.Security.Add(new OpenApiSecurityRequirement
        {
            [new OpenApiSecuritySchemeReference("Bearer")] = [],
        });
        operation.Responses.TryAdd("401", new OpenApiResponse { Description = "Unauthorized — missing or expired token." });
        operation.Responses.TryAdd("403", new OpenApiResponse { Description = "Forbidden." });
        return Task.CompletedTask;
    }
}
