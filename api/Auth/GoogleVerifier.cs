using System.IdentityModel.Tokens.Jwt;
using Microsoft.IdentityModel.Tokens;

namespace SplitShare.Api.Auth;

public sealed record GoogleIdentity(string Sub, string Email, bool EmailVerified);

/// <summary>Validates Google ID tokens against Google's JWKS (spec task 3.2).</summary>
public sealed class GoogleVerifier(HttpClient http, IConfiguration config)
{
    private static readonly string JwksUrl = "https://www.googleapis.com/oauth2/v3/certs";
    private static JsonWebKeySet? _cached;
    private static DateTime _cachedAt;

    public async Task<GoogleIdentity?> VerifyAsync(string idToken)
    {
        var clientId = config["Auth:GoogleClientId"];
        if (string.IsNullOrWhiteSpace(clientId))
            throw new InvalidOperationException("Auth:GoogleClientId not configured.");

        if (_cached is null || DateTime.UtcNow - _cachedAt > TimeSpan.FromHours(1))
        {
            var jwks = await http.GetStringAsync(JwksUrl);
            _cached = new JsonWebKeySet(jwks);
            _cachedAt = DateTime.UtcNow;
        }

        var handler = new JwtSecurityTokenHandler();
        try
        {
            var principal = handler.ValidateToken(idToken, new TokenValidationParameters
            {
                ValidIssuers = ["https://accounts.google.com", "accounts.google.com"],
                ValidAudience = clientId,
                IssuerSigningKeys = _cached.Keys,
                ValidateLifetime = true,
                ClockSkew = TimeSpan.FromMinutes(2)
            }, out _);
            var sub = principal.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
            var email = principal.FindFirst(JwtRegisteredClaimNames.Email)?.Value;
            var verified = principal.FindFirst("email_verified")?.Value == "true";
            if (sub is null || email is null) return null;
            return new GoogleIdentity(sub, email, verified);
        }
        catch
        {
            return null;
        }
    }
}
