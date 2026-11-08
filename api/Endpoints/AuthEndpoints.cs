using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;

namespace SplitShare.Api.Endpoints;

public static class AuthEndpoints
{
    public static Guid? CurrentUserId(ClaimsPrincipal p)
        => Guid.TryParse(p.FindFirstValue(JwtRegisteredClaimNames.Sub), out var id) ? id : null;

    internal static object UserDto(Models.User u) => new
    {
        user_id = u.Id, username = u.Username, email = u.Email,
        display_name = u.Name, phone = u.Phone,
        email_verified = u.EmailVerifiedAt is not null, has_password = u.PasswordHash is not null
    };

    private static object PairDto(AuthResult r) => new
    {
        user = UserDto(r.User!),
        access_token = r.Tokens!.AccessToken, token_type = "Bearer",
        refresh_token = r.Tokens.RefreshToken,
        auto_joined_groups = Array.Empty<Guid>(),
        is_new_user = r.Created
    };

    public static void Map(RouteGroupBuilder v1)
    {
        var auth = v1.MapGroup("/auth").RequireRateLimiting("auth-ip");

        // Email invites are never joined implicitly: only opening the invitation link
        // (/invitations/{token}) adds the user, so auto_joined_groups stays empty.
        auth.MapPost("/register", async (RegisterDto d, AuthService svc) =>
        {
            var r = await svc.RegisterAsync(d.Username, d.Email, d.DisplayName, d.Password, d.Phone);
            if (!r.Ok)
                return ApiResults.Error(r.ErrorCode!, r.Error!,
                    r.ErrorCode == "VALIDATION" ? 422 : StatusCodes.Status409Conflict, r.Fields);
            return Results.Created("/api/v1/me", PairDto(r));
        });

        auth.MapPost("/login", async (LoginDto d, AuthService svc) =>
        {
            var r = await svc.LoginAsync(d.UsernameOrEmail, d.Password);
            if (!r.Ok && r.ErrorCode == "LOCKED_OUT")
                return ApiResults.Error(r.ErrorCode, r.Error!, StatusCodes.Status423Locked);
            return r.Ok ? Results.Ok(PairDto(r))
                : ApiResults.Error(r.ErrorCode!, r.Error!, StatusCodes.Status401Unauthorized);
        });

        // Email one-time code: request always answers ok for any valid address (no enumeration).
        auth.MapPost("/otp/request", async (OtpRequestDto d, AuthService svc, HttpContext http) =>
        {
            var r = await svc.RequestOtpAsync(d.Email);
            if (r.Ok) return Results.Ok(new { status = "ok", expires_in_minutes = AuthService.OtpMinutes,
                resend_after_seconds = AuthService.OtpCooldownSeconds });
            if (r.RetryAfterSeconds is { } wait) http.Response.Headers.RetryAfter = wait.ToString();
            return ApiResults.Error(r.ErrorCode!, r.Error!, r.ErrorCode switch
            {
                "VALIDATION" => 422,
                "OTP_COOLDOWN" => StatusCodes.Status429TooManyRequests,
                _ => StatusCodes.Status502BadGateway
            });
        });

        auth.MapPost("/otp/verify", async (OtpVerifyDto d, AuthService svc) =>
        {
            var r = await svc.VerifyOtpAsync(d.Email, d.Code);
            return r.Ok ? Results.Ok(PairDto(r))
                : ApiResults.Error(r.ErrorCode!, r.Error!, StatusCodes.Status401Unauthorized);
        });

        auth.MapPost("/google", async (GoogleDto d, AuthService svc, GoogleVerifier verifier) =>
        {
            GoogleIdentity? g;
            try { g = await verifier.VerifyAsync(d.IdToken); }
            catch (InvalidOperationException ex) { return ApiResults.Error("VALIDATION", ex.Message, 422); }
            if (g is null) return ApiResults.Error("UNAUTH", "Invalid Google token.", 401);
            var r = await svc.GoogleAsync(g);
            if (!r.Ok)
                return ApiResults.Error(r.ErrorCode!, r.Error!, StatusCodes.Status403Forbidden);
            return Results.Ok(PairDto(r));
        });

        auth.MapPost("/refresh", async (RefreshDto d, AuthService svc) =>
        {
            var r = await svc.RefreshAsync(d.RefreshToken);
            return r.Ok ? Results.Ok(PairDto(r))
                : ApiResults.Error(r.ErrorCode!, r.Error!, StatusCodes.Status401Unauthorized);
        });

        auth.MapPost("/logout", async (RefreshDto d, AuthService svc) =>
        {
            await svc.LogoutAsync(d.RefreshToken);
            return Results.Ok(new { status = "ok" });
        });

        auth.MapPost("/forgot", async (ForgotDto d, AuthService svc) =>
        {
            await svc.ForgotAsync(d.Email); // always 200: no enumeration
            return Results.Ok(new { status = "ok" });
        });

        auth.MapPost("/reset", async (ResetDto d, AuthService svc) =>
        {
            var r = await svc.ResetAsync(d.Token, d.NewPassword);
            return r.Ok ? Results.Ok(PairDto(r))
                : ApiResults.Error(r.ErrorCode!, r.Error!,
                    r.ErrorCode == "VALIDATION" ? 422 : StatusCodes.Status401Unauthorized);
        });

        auth.MapPost("/verify-email", async (VerifyDto d, AuthService svc) =>
            await svc.VerifyEmailAsync(d.Token)
                ? Results.Ok(new { status = "ok" })
                : ApiResults.Error("UNAUTH", "Invalid or expired verification token.", 401));
    }

    public static void MapAccount(RouteGroupBuilder api)
    {
        api.MapGet("/me", async (ClaimsPrincipal p, AppDbContext db) =>
        {
            var id = CurrentUserId(p);
            var u = id is null ? null : await db.Users.FindAsync(id);
            return u is null ? ApiResults.Error("UNAUTH", "Not authenticated.", 401) : Results.Ok(UserDto(u));
        });

        api.MapPatch("/me", async (UpdateProfileDto d, ClaimsPrincipal p, AppDbContext db) =>
        {
            var id = CurrentUserId(p);
            var u = id is null ? null : await db.Users.FindAsync(id);
            if (u is null) return ApiResults.Error("UNAUTH", "Not authenticated.", 401);
            // Empty clears the name: responses then show the email (User.Name).
            if (d.DisplayName is not null)
            {
                var name = d.DisplayName.Trim();
                if (name.Length > AuthService.MaxDisplayName)
                    return ApiResults.Validation("Invalid display_name.");
                u.DisplayName = name == u.Email ? "" : name;
            }
            if (d.Phone is not null) u.Phone = d.Phone;
            await db.SaveChangesAsync();
            return Results.Ok(UserDto(u));
        });

        api.MapPatch("/me/password", async (ChangePwDto d, ClaimsPrincipal p, AuthService svc) =>
        {
            var id = CurrentUserId(p);
            if (id is null) return ApiResults.Error("UNAUTH", "Not authenticated.", 401);
            var r = await svc.ChangePasswordAsync(id.Value, d.CurrentPassword, d.NewPassword);
            return r.Ok ? Results.Ok(new { status = "ok" })
                : ApiResults.Error(r.ErrorCode!, r.Error!,
                    r.ErrorCode == "VALIDATION" ? 422 : StatusCodes.Status401Unauthorized);
        });

        api.MapDelete("/me", async (ClaimsPrincipal p, AuthService svc) =>
        {
            var id = CurrentUserId(p);
            if (id is null) return ApiResults.Error("UNAUTH", "Not authenticated.", 401);
            var blockers = await svc.DeleteBlockersAsync(id.Value);
            if (blockers.Count > 0)
                return ApiResults.Error("HAS_OPEN_BALANCE",
                    $"Settle balances first: {string.Join(", ", blockers)}.", 422);
            await svc.DeleteAsync(id.Value);
            return Results.Ok(new { status = "ok" });
        });

        api.MapGet("/contacts", async (string? q, int? limit, ClaimsPrincipal p, AuthService svc) =>
        {
            var id = CurrentUserId(p);
            if (id is null) return ApiResults.Error("UNAUTH", "Not authenticated.", 401);
            return Results.Ok(await svc.SearchContactsAsync(id.Value, q, limit ?? 20));
        });
    }

    // Username / DisplayName are optional (email-only sign-up); kept for older clients.
    public sealed record RegisterDto(string? Username, string Email, string? DisplayName, string Password, string? Phone);
    public sealed record OtpRequestDto(string Email);
    public sealed record OtpVerifyDto(string Email, string Code);
    public sealed record LoginDto(string UsernameOrEmail, string Password);
    public sealed record GoogleDto(string IdToken);
    public sealed record RefreshDto(string RefreshToken);
    public sealed record ForgotDto(string Email);
    public sealed record ResetDto(string Token, string NewPassword);
    public sealed record VerifyDto(string Token);
    public sealed record UpdateProfileDto(string? DisplayName, string? Phone);
    public sealed record ChangePwDto(string? CurrentPassword, string NewPassword);
}
