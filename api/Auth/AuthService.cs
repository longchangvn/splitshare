using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Api.Auth;

public sealed record AuthResult(bool Ok, string? ErrorCode, string? Error, User? User, TokenPair? Tokens,
    Dictionary<string, string[]>? Fields = null, bool Created = false);

/// <summary>Outcome of an OTP request. <see cref="RetryAfterSeconds"/> is set on cooldown.</summary>
public sealed record OtpRequestResult(bool Ok, string? ErrorCode = null, string? Error = null, int? RetryAfterSeconds = null);

public sealed class AuthService(AppDbContext db, TokenService tokens, IEmailSender email, LedgerService ledger,
    IConfiguration? config = null, ILogger<AuthService>? logger = null)
{
    // Web origin for links in emails (same App:BaseUrl as invite links).
    private string BaseUrl => (config?["App:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/');

    private const int MaxFailed = 10;
    private const int ResetMinutes = 15;
    public const int OtpMinutes = 10;
    public const int OtpMaxAttempts = 5;
    public const int OtpCooldownSeconds = 60;
    public const int OtpMaxPerHour = 5;
    private static readonly TimeSpan LockoutFor = TimeSpan.FromMinutes(15);
    private static readonly Regex UsernameRe = new("^[a-z0-9_.-]{3,30}$", RegexOptions.Compiled);

    public const int MaxDisplayName = 50;

    /// <param name="username">Legacy handle (a-z 0-9 _ . -, 3-30) or the email itself (email sign-ups).</param>
    /// <param name="displayName">Optional: empty means "show the email" (see <see cref="User.Name"/>).</param>
    public static Dictionary<string, string[]>? ValidateRegister(string username, string email, string displayName, string password)
    {
        var fields = new Dictionary<string, List<string>>();
        void Add(string k, string m)
        {
            if (!fields.TryGetValue(k, out var list)) fields[k] = list = [];
            list.Add(m);
        }
        var u = username.ToLowerInvariant();
        if (u != email.ToLowerInvariant() && !UsernameRe.IsMatch(u))
            Add("username", "3-30 chars: a-z 0-9 _ . -");
        if (!IsEmail(email)) Add("email", "Invalid email.");
        if (displayName.Length > MaxDisplayName)
            Add("display_name", $"Max {MaxDisplayName} chars.");
        var pw = ValidatePassword(password);
        if (pw is not null) Add("password", pw);
        return fields.Count == 0 ? null : fields.ToDictionary(kv => kv.Key, kv => kv.Value.ToArray());
    }

    public static string? ValidatePassword(string password)
    {
        if (password.Length < 8) return "Min 8 chars.";
        if (!password.Any(char.IsLetter) || !password.Any(char.IsDigit))
            return "Must contain a letter and a digit.";
        return null;
    }

    public static bool IsEmail(string v)
    {
        try { _ = new MailAddress(v); return v.Length <= 320; }
        catch { return false; }
    }

    /// <summary>Unique username derived from the address's local part (a-z 0-9 _ . -, 3-30 chars).</summary>
    private async Task<string> DefaultUsernameAsync(string emailAddr)
    {
        var baseName = new string(emailAddr.Split('@')[0].ToLowerInvariant()
            .Where(c => char.IsAsciiLetterOrDigit(c) || c is '_' or '.' or '-').ToArray());
        if (baseName.Length < 3) baseName = $"user{baseName}";
        baseName = baseName[..Math.Min(24, baseName.Length)];
        var username = baseName;
        for (var i = 1; await db.Users.AnyAsync(u => u.Username == username); i++)
            username = $"{baseName}-{i}";
        return username;
    }

    private static string DefaultDisplayName(string emailAddr)
    {
        var local = emailAddr.Split('@')[0];
        return local[..Math.Min(50, local.Length)];
    }

    /// <summary>
    /// Adds (unsaved) the account for an emailed-invite acceptance: the email is the
    /// username, no display name (the email shows until one is set), email verified —
    /// the link was delivered to it. The caller saves it together with the group membership.
    /// </summary>
    public Task<User> StageInvitedUserAsync(string emailAddr, string password)
    {
        emailAddr = emailAddr.Trim().ToLowerInvariant();
        var user = new User
        {
            Username = emailAddr, Email = emailAddr,
            PasswordHash = PasswordHasher.Hash(password), EmailVerifiedAt = DateTime.UtcNow
        };
        db.Users.Add(user);
        return Task.FromResult(user);
    }

    public async Task<AuthResult> SignInAsync(User user) => new(true, null, null, user, await IssueTokensAsync(user));

    private async Task<TokenPair> IssueTokensAsync(User user)
    {
        var refresh = TokenService.NewOpaqueToken();
        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = user.Id,
            TokenHash = TokenService.HashToken(refresh),
            ExpiresAt = DateTime.UtcNow.AddDays(30)
        });
        await db.SaveChangesAsync();
        return new TokenPair(tokens.CreateAccessToken(user), refresh, DateTime.UtcNow.AddDays(30));
    }

    /// <summary>
    /// Password sign-up. Only email + password are required: a blank username becomes the
    /// email and a blank display name stays empty (the email is shown instead).
    /// </summary>
    public async Task<AuthResult> RegisterAsync(string? username, string emailAddr, string? displayName, string password, string? phone)
    {
        emailAddr = (emailAddr ?? "").Trim().ToLowerInvariant();
        username = string.IsNullOrWhiteSpace(username) ? emailAddr : username.Trim().ToLowerInvariant();
        displayName = displayName?.Trim() ?? "";
        password ??= "";
        var invalid = ValidateRegister(username, emailAddr, displayName, password);
        if (invalid is not null) return new(false, "VALIDATION", "Invalid registration.", null, null, invalid);
        // Email first: for email sign-ups the username is the email, and "email taken" is the useful answer.
        if (await db.Users.AnyAsync(u => u.Email == emailAddr))
            return new(false, "EMAIL_TAKEN", "Email taken.", null, null,
                new() { ["email"] = ["Email taken."] });
        if (await db.Users.AnyAsync(u => u.Username == username))
            return new(false, "USERNAME_TAKEN", "Username taken.", null, null,
                new() { ["username"] = ["Username taken."] });
        if (phone is not null && await db.Users.AnyAsync(u => u.Phone == phone))
            return new(false, "PHONE_TAKEN", "Phone taken.", null, null,
                new() { ["phone"] = ["Phone taken."] });

        var user = new User
        {
            Username = username, Email = emailAddr, DisplayName = displayName,
            Phone = phone, PasswordHash = PasswordHasher.Hash(password)
        };
        db.Users.Add(user);
        await db.SaveChangesAsync();

        var raw = TokenService.NewOpaqueToken();
        db.EmailVerificationTokens.Add(new EmailVerificationToken
        {
            UserId = user.Id, TokenHash = TokenService.HashToken(raw)
        });
        await db.SaveChangesAsync();
        var mail = EmailTemplates.VerifyEmail(user.Name, $"{BaseUrl}/verify/{raw}", emailAddr);
        await email.SendAsync(emailAddr, mail.Subject, mail.Text, transactional: true, html: mail.Html);

        return new(true, null, null, user, await IssueTokensAsync(user), Created: true);
    }

    private static string OtpHash(string emailAddr, string code) => TokenService.HashToken($"{emailAddr}:{code}");

    /// <summary>
    /// Emails a 6-digit sign-in code. Same answer whether or not the address has an
    /// account (no enumeration); earlier unused codes for the address are revoked.
    /// Limited to one code per <see cref="OtpCooldownSeconds"/> and <see cref="OtpMaxPerHour"/> per hour.
    /// </summary>
    public Task<OtpRequestResult> RequestOtpAsync(string? emailAddr) => SendCodeAsync(emailAddr, verify: false);

    /// <param name="verify">Word the email as "confirm your email" (Profile) instead of a sign-in code.</param>
    private async Task<OtpRequestResult> SendCodeAsync(string? emailAddr, bool verify)
    {
        emailAddr = (emailAddr ?? "").Trim().ToLowerInvariant();
        if (!IsEmail(emailAddr)) return new(false, "VALIDATION", "Invalid email.");
        var now = DateTime.UtcNow;
        var recent = await db.EmailOtps.Where(o => o.Email == emailAddr && o.CreatedAt > now.AddHours(-1))
            .OrderByDescending(o => o.CreatedAt).ToListAsync();
        if (recent.Count > 0)
        {
            var wait = OtpCooldownSeconds - (int)(now - recent[0].CreatedAt).TotalSeconds;
            if (wait > 0) return new(false, "OTP_COOLDOWN", $"Wait {wait}s before requesting another code.", wait);
        }
        if (recent.Count >= OtpMaxPerHour)
        {
            var wait = (int)Math.Ceiling((recent[^1].CreatedAt.AddHours(1) - now).TotalSeconds);
            return new(false, "OTP_COOLDOWN", "Too many codes requested. Try again later.", Math.Max(wait, 1));
        }
        foreach (var o in recent.Where(o => o.UsedAt is null)) o.UsedAt = now;

        var code = System.Security.Cryptography.RandomNumberGenerator.GetInt32(0, 1_000_000).ToString("D6");
        var otp = new EmailOtp
        {
            Email = emailAddr, CodeHash = OtpHash(emailAddr, code), CreatedAt = now,
            ExpiresAt = now.AddMinutes(OtpMinutes)
        };
        db.EmailOtps.Add(otp);
        await db.SaveChangesAsync();

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == emailAddr);
        var mail = verify
            ? EmailTemplates.VerifyCode(user?.Name, code, OtpMinutes, emailAddr)
            : EmailTemplates.LoginCode(user?.Name, code, OtpMinutes, emailAddr);
        var sent = await email.SendAsync(emailAddr, mail.Subject, mail.Text, transactional: true, html: mail.Html);
        if (sent.Status == EmailSendStatus.NotConfigured)
            logger?.LogWarning("Sign-in code not delivered: email provider is not configured ({Error}).", sent.Error);
        if (sent.Status != EmailSendStatus.Failed) return new(true); // NotConfigured = dev stub: code is only logged
        // Undelivered code: drop it so it neither counts toward the cooldown/hourly cap nor works.
        db.EmailOtps.Remove(otp);
        await db.SaveChangesAsync();
        return new(false, "EMAIL_FAILED", "Could not send the code. Try again shortly.");
    }

    /// <summary>
    /// Checks the latest code for the address. Signs in the existing account, or creates one
    /// (username = email, no display name, email verified). Wrong codes count toward
    /// <see cref="OtpMaxAttempts"/>, after which the code is burned.
    /// </summary>
    public async Task<AuthResult> VerifyOtpAsync(string? emailAddr, string? code)
    {
        emailAddr = (emailAddr ?? "").Trim().ToLowerInvariant();
        if (!await ConsumeOtpAsync(emailAddr, code))
            return new(false, "INVALID_CODE", InvalidCodeMsg, null, null);
        var now = DateTime.UtcNow;
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == emailAddr);
        var created = user is null;
        if (user is null)
        {
            user = new User { Username = emailAddr, Email = emailAddr, EmailVerifiedAt = now };
            db.Users.Add(user);
        }
        else user.EmailVerifiedAt ??= now;
        await db.SaveChangesAsync();
        return new(true, null, null, user, await IssueTokensAsync(user), Created: created);
    }

    private const string InvalidCodeMsg = "Invalid or expired code.";

    /// <summary>
    /// Checks <paramref name="code"/> against the latest live code for the (normalized) address
    /// and uses it up on a match. Wrong codes count toward <see cref="OtpMaxAttempts"/>, after
    /// which the code is burned. Changes are saved before returning.
    /// </summary>
    private async Task<bool> ConsumeOtpAsync(string emailAddr, string? code)
    {
        code = (code ?? "").Trim();
        var now = DateTime.UtcNow;
        var otp = await db.EmailOtps.Where(o => o.Email == emailAddr && o.UsedAt == null && o.ExpiresAt > now)
            .OrderByDescending(o => o.CreatedAt).FirstOrDefaultAsync();
        if (otp is null || otp.Attempts >= OtpMaxAttempts) return false;
        var match = System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
            System.Text.Encoding.ASCII.GetBytes(OtpHash(emailAddr, code)),
            System.Text.Encoding.ASCII.GetBytes(otp.CodeHash));
        if (match) otp.UsedAt = now;
        else if (++otp.Attempts >= OtpMaxAttempts) otp.UsedAt = now;
        await db.SaveChangesAsync();
        return match;
    }

    // --- Email verification from Profile: a 6-digit code (in-app) or a fresh link. ---

    private static readonly TimeSpan VerifyLinkValid = TimeSpan.FromDays(7);

    private static readonly OtpRequestResult AlreadyVerified =
        new(false, "ALREADY_VERIFIED", "Email is already verified.");

    /// <summary>Emails a 6-digit code to the signed-in user's own address (same limits as sign-in codes).</summary>
    public async Task<OtpRequestResult> RequestVerifyCodeAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return new(false, "UNAUTH", "Not authenticated.");
        if (user.EmailVerifiedAt is not null) return AlreadyVerified;
        return await SendCodeAsync(user.Email, verify: true);
    }

    /// <summary>Marks the signed-in user's email verified when <paramref name="code"/> matches.</summary>
    public async Task<AuthResult> ConfirmVerifyCodeAsync(Guid userId, string? code)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return new(false, "UNAUTH", "Not authenticated.", null, null);
        if (user.EmailVerifiedAt is not null) return new(true, null, null, user, null);
        if (!await ConsumeOtpAsync(user.Email, code)) return new(false, "INVALID_CODE", InvalidCodeMsg, null, null);
        user.EmailVerifiedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return new(true, null, null, user, null);
    }

    /// <summary>
    /// Emails a fresh verification link (/verify/{token}); older unused links stop working.
    /// One per <see cref="OtpCooldownSeconds"/>: the table has no creation time, so it is
    /// derived from the fixed 7-day expiry (no migration).
    /// </summary>
    public async Task<OtpRequestResult> SendVerifyLinkAsync(Guid userId)
    {
        var user = await db.Users.FindAsync(userId);
        if (user is null) return new(false, "UNAUTH", "Not authenticated.");
        if (user.EmailVerifiedAt is not null) return AlreadyVerified;
        var now = DateTime.UtcNow;
        var open = await db.EmailVerificationTokens.Where(t => t.UserId == userId && t.UsedAt == null).ToListAsync();
        var lastCreated = open.Count == 0 ? (DateTime?)null : open.Max(t => t.ExpiresAt) - VerifyLinkValid;
        if (lastCreated is { } c && (now - c).TotalSeconds < OtpCooldownSeconds)
        {
            var wait = Math.Max(1, OtpCooldownSeconds - (int)(now - c).TotalSeconds);
            return new(false, "OTP_COOLDOWN", $"Wait {wait}s before requesting another link.", wait);
        }
        foreach (var t in open) t.UsedAt = now;
        var raw = TokenService.NewOpaqueToken();
        var row = new EmailVerificationToken
        {
            UserId = userId, TokenHash = TokenService.HashToken(raw), ExpiresAt = now + VerifyLinkValid
        };
        db.EmailVerificationTokens.Add(row);
        await db.SaveChangesAsync();

        var mail = EmailTemplates.VerifyEmail(user.Name, $"{BaseUrl}/verify/{raw}", user.Email);
        var sent = await email.SendAsync(user.Email, mail.Subject, mail.Text, transactional: true, html: mail.Html);
        if (sent.Status != EmailSendStatus.Failed) return new(true);
        // Undelivered: restore the previous links so the user isn't left with none.
        db.EmailVerificationTokens.Remove(row);
        foreach (var t in open) t.UsedAt = null;
        await db.SaveChangesAsync();
        return new(false, "EMAIL_FAILED", "Could not send the link. Try again shortly.");
    }

    public async Task<AuthResult> LoginAsync(string? usernameOrEmail, string? password)
    {
        if (string.IsNullOrWhiteSpace(usernameOrEmail) || password is null)
            return new(false, "INVALID_CREDENTIALS", "Invalid credentials.", null, null);
        var key = usernameOrEmail.ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == key || u.Email == key);
        // Generic error either way: no account enumeration (spec task 3.1).
        if (user?.PasswordHash is null)
            return new(false, "INVALID_CREDENTIALS", "Invalid credentials.", null, null);
        if (user.LockedUntilUtc > DateTime.UtcNow)
            return new(false, "LOCKED_OUT", $"Locked until {user.LockedUntilUtc:O}.", null, null);
        if (!PasswordHasher.Verify(password!, user.PasswordHash))
        {
            // Wrong password on a known user accumulates lockout (10 fails -> 15 min).
            user.FailedLoginAttempts++;
            if (user.FailedLoginAttempts >= MaxFailed)
                user.LockedUntilUtc = DateTime.UtcNow + LockoutFor;
            await db.SaveChangesAsync();
            return new(false, "INVALID_CREDENTIALS", "Invalid credentials.", null, null);
        }
        user.FailedLoginAttempts = 0;
        user.LockedUntilUtc = null;
        await db.SaveChangesAsync();
        return new(true, null, null, user, await IssueTokensAsync(user));
    }

    public async Task<AuthResult> GoogleAsync(GoogleIdentity g)
    {
        if (!g.EmailVerified)
            return new(false, "GOOGLE_EMAIL_UNVERIFIED", "Google email not verified.", null, null);
        var gEmail = g.Email.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSub == g.Sub)
            ?? await db.Users.FirstOrDefaultAsync(u => u.Email == gEmail);
        if (user is null)
        {
            user = new User
            {
                Username = await DefaultUsernameAsync(gEmail), Email = gEmail, DisplayName = DefaultDisplayName(gEmail),
                GoogleSub = g.Sub, EmailVerifiedAt = DateTime.UtcNow
            };
            db.Users.Add(user);
            await db.SaveChangesAsync();
            // Pending email invites auto-join here in task 4.2 (group must exist first).
        }
        else if (user.GoogleSub is null)
        {
            user.GoogleSub = g.Sub;
            user.EmailVerifiedAt ??= DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
        return new(true, null, null, user, await IssueTokensAsync(user));
    }

    public async Task<AuthResult> RefreshAsync(string refreshToken)
    {
        var row = await db.RefreshTokens
            .FirstOrDefaultAsync(r => r.TokenHash == TokenService.HashToken(refreshToken));
        var user = row is null ? null : await db.Users.FindAsync(row.UserId);
        if (row is null || user is null || row.RevokedAt is not null || row.ExpiresAt < DateTime.UtcNow)
            return new(false, "UNAUTH", "Invalid refresh token.", null, null);
        row.RevokedAt = DateTime.UtcNow; // rotation
        await db.SaveChangesAsync();
        return new(true, null, null, user, await IssueTokensAsync(user));
    }

    public async Task LogoutAsync(string refreshToken)
    {
        var row = await db.RefreshTokens
            .FirstOrDefaultAsync(r => r.TokenHash == TokenService.HashToken(refreshToken));
        if (row is not null && row.RevokedAt is null)
        {
            row.RevokedAt = DateTime.UtcNow;
            await db.SaveChangesAsync();
        }
    }

    public async Task ForgotAsync(string em)
    {
        em = em.Trim().ToLowerInvariant();
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == em);
        if (user is null) return; // no enumeration
        var raw = TokenService.NewOpaqueToken();
        db.PasswordResetTokens.Add(new PasswordResetToken
        {
            UserId = user.Id, TokenHash = TokenService.HashToken(raw),
            ExpiresAt = DateTime.UtcNow.AddMinutes(ResetMinutes)
        });
        await db.SaveChangesAsync();
        var mail = EmailTemplates.PasswordReset(user.Name, $"{BaseUrl}/reset/{raw}", ResetMinutes, em);
        await email.SendAsync(em, mail.Subject, mail.Text, transactional: true, html: mail.Html);
    }

    public async Task<AuthResult> ResetAsync(string token, string newPassword)
    {
        var pw = ValidatePassword(newPassword);
        if (pw is not null) return new(false, "VALIDATION", pw, null, null);
        var row = await db.PasswordResetTokens
            .FirstOrDefaultAsync(r => r.TokenHash == TokenService.HashToken(token));
        var user = row is null ? null : await db.Users.FindAsync(row.UserId);
        if (row is null || user is null || row.UsedAt is not null || row.ExpiresAt < DateTime.UtcNow)
            return new(false, "UNAUTH", "Invalid or expired reset token.", null, null);
        row.UsedAt = DateTime.UtcNow;
        user.PasswordHash = PasswordHasher.Hash(newPassword);
        user.FailedLoginAttempts = 0;
        user.LockedUntilUtc = null;
        await db.SaveChangesAsync();
        return new(true, null, null, user, await IssueTokensAsync(user));
    }

    public async Task<bool> VerifyEmailAsync(string token)
    {
        var row = await db.EmailVerificationTokens
            .FirstOrDefaultAsync(r => r.TokenHash == TokenService.HashToken(token));
        var user = row is null ? null : await db.Users.FindAsync(row.UserId);
        if (row is null || user is null || row.UsedAt is not null || row.ExpiresAt < DateTime.UtcNow)
            return false;
        row.UsedAt = DateTime.UtcNow;
        user.EmailVerifiedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return true;
    }

    public async Task<AuthResult> ChangePasswordAsync(Guid userId, string? current, string next)
    {
        var pw = ValidatePassword(next);
        if (pw is not null) return new(false, "VALIDATION", pw, null, null);
        var user = await db.Users.FindAsync(userId);
        if (user is null) return new(false, "UNAUTH", "Not authenticated.", null, null);
        if (user.PasswordHash is not null && (current is null || !PasswordHasher.Verify(current, user.PasswordHash)))
            return new(false, "INVALID_CREDENTIALS", "Current password incorrect.", null, null);
        user.PasswordHash = PasswordHasher.Hash(next);
        await db.SaveChangesAsync();
        return new(true, null, null, user, null);
    }

    /// <returns>Blocking group names when nets are non-zero; empty means safe to delete.</returns>
    public async Task<List<string>> DeleteBlockersAsync(Guid userId)
    {
        var groupIds = await db.GroupMembers.Where(m => m.UserId == userId)
            .Select(m => m.GroupId).ToListAsync();
        var blockers = new List<string>();
        foreach (var gid in groupIds)
        {
            var snapshot = await ledger.ComputeNetsAsync(gid);
            if (snapshot is not null && snapshot.Nets.TryGetValue(userId, out var net) && net != 0)
            {
                var g = await db.Groups.FindAsync(gid);
                blockers.Add(g?.Name ?? gid.ToString());
            }
        }
        return blockers;
    }

    public async Task DeleteAsync(Guid userId)
    {
        foreach (var t in db.RefreshTokens.Where(r => r.UserId == userId)) t.RevokedAt ??= DateTime.UtcNow;
        db.Users.RemoveRange(db.Users.Where(u => u.Id == userId));
        await db.SaveChangesAsync();
    }

    public async Task<List<object>> SearchContactsAsync(Guid userId, string? q, int limit)
    {
        limit = Math.Clamp(limit, 1, 50);
        var myGroups = db.GroupMembers.Where(m => m.UserId == userId).Select(m => m.GroupId);
        var peerIds = db.GroupMembers
            .Where(m => m.UserId != userId && myGroups.Contains(m.GroupId))
            .Select(m => m.UserId).Distinct();
        var query = db.Users.Where(u => peerIds.Contains(u.Id));
        if (!string.IsNullOrWhiteSpace(q))
        {
            var s = q.ToLower();
            query = query.Where(u => u.DisplayName.ToLower().Contains(s)
                || u.Username.Contains(s) || u.Email.ToLower().Contains(s));
        }
        return (await query.OrderBy(u => u.DisplayName == "" ? u.Email : u.DisplayName).Take(limit).ToListAsync())
            .Select(u => (object)new { user_id = u.Id, display_name = u.Name, username = u.Username, avatar_url = (string?)null })
            .ToList();
    }
}
