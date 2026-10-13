using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using SplitShare.Api.Models;

namespace SplitShare.Api.Auth;

public sealed record TokenPair(string AccessToken, string RefreshToken, DateTime RefreshExpiresAt);

public sealed class TokenService(IConfiguration config)
{
    public const string Issuer = "splitshare";
    public const string Audience = "splitshare";

    private string Key
    {
        get
        {
            var k = config["Jwt:Key"];
            if (string.IsNullOrWhiteSpace(k) || k.Length < 32)
                throw new InvalidOperationException("Jwt:Key missing or too short (>=32 chars). Set it in config or env (Jwt__Key).");
            return k;
        }
    }

    public string CreateAccessToken(User user)
    {
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Key)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(Issuer, Audience,
            [new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
             new Claim(JwtRegisteredClaimNames.UniqueName, user.Username),
             new Claim(JwtRegisteredClaimNames.Email, user.Email)],
            expires: DateTime.UtcNow.AddMinutes(15),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static string NewOpaqueToken() => Convert.ToHexString(RandomNumberGenerator.GetBytes(32));

    public static string HashToken(string token)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
