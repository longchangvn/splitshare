using System.Net.Mail;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Models;
using SplitShare.Api.Services;

namespace SplitShare.Api.Auth;

public sealed record AuthResult(bool Ok, string? ErrorCode, string? Error, User? User, TokenPair? Tokens,
    Dictionary<string, string[]>? Fields = null);

public sealed class AuthService(AppDbContext db, TokenService tokens, IEmailSender email, LedgerService ledger,
    IConfiguration? config = null)
{
    // Web origin for links in emails (same App:BaseUrl as invite links).
    private string BaseUrl => (config?["App:BaseUrl"] ?? "http://localhost:3000").TrimEnd('/');

    private const int MaxFailed = 10;
    private static readonly TimeSpan LockoutFor = TimeSpan.FromMinutes(15);
    private static readonly Regex UsernameRe = new("^[a-z0-9_.-]{3,30}$", RegexOptions.Compiled);

    public static Dictionary<string, string[]>? ValidateRegister(string username, string email, string displayName, string password)
    {
        var fields = new Dictionary<string, List<string>>();
        void Add(string k, string m)
        {
            if (!fields.TryGetValue(k, out var list)) fields[k] = list = [];
            list.Add(m);
        }
        if (!UsernameRe.IsMatch(username.ToLowerInvariant()))
            Add("username", "3-30 chars: a-z 0-9 _ . -");
        if (!IsEmail(email)) Add("email", "Invalid email.");
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Length > 50)
            Add("display_name", "Required, max 50 chars.");
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

    public async Task<AuthResult> RegisterAsync(string username, string emailAddr, string displayName, string password, string? phone)
    {
        username = username.ToLowerInvariant();
        emailAddr = emailAddr.Trim().ToLowerInvariant();
        var invalid = ValidateRegister(username, emailAddr, displayName, password);
        if (invalid is not null) return new(false, "VALIDATION", "Invalid registration.", null, null, invalid);
        if (await db.Users.AnyAsync(u => u.Username == username))
            return new(false, "USERNAME_TAKEN", "Username taken.", null, null,
                new() { ["username"] = ["Username taken."] });
        if (await db.Users.AnyAsync(u => u.Email == emailAddr))
            return new(false, "EMAIL_TAKEN", "Email taken.", null, null,
                new() { ["email"] = ["Email taken."] });
        if (phone is not null && await db.Users.AnyAsync(u => u.Phone == phone))
            return new(false, "PHONE_TAKEN", "Phone taken.", null, null,
                new() { ["phone"] = ["Phone taken."] });

        var user = new User
        {
            Username = username, Email = emailAddr, DisplayName = displayName.Trim(),
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
        await email.SendAsync(emailAddr, "Verify your SplitShare email",
            $"Hi {user.DisplayName},\n\nConfirm your email address for SplitShare:\n{BaseUrl}/verify/{raw}\n\n" +
            "If you didn't create a SplitShare account, you can ignore this email.", transactional: true);

        return new(true, null, null, user, await IssueTokensAsync(user));
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
            var baseName = new string(g.Email.Split('@')[0].ToLowerInvariant()
                .Where(c => char.IsLetterOrDigit(c) || c is '_' or '.' or '-').ToArray());
            if (baseName.Length < 3) baseName = $"user{baseName}";
            var username = baseName[..Math.Min(24, baseName.Length)];
            for (var i = 1; await db.Users.AnyAsync(u => u.Username == username); i++)
                username = $"{baseName[..Math.Min(24, baseName.Length)]}-{i}";
            user = new User
            {
                Username = username, Email = gEmail, DisplayName = gEmail.Split('@')[0],
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
            ExpiresAt = DateTime.UtcNow.AddMinutes(15)
        });
        await db.SaveChangesAsync();
        await email.SendAsync(em, "Reset your SplitShare password",
            $"Hi {user.DisplayName},\n\nReset your SplitShare password here (valid 15 minutes, single use):\n" +
            $"{BaseUrl}/reset/{raw}\n\nIf you didn't request a password reset, you can ignore this email.",
            transactional: true);
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
        return (await query.OrderBy(u => u.DisplayName).Take(limit).ToListAsync())
            .Select(u => (object)new { user_id = u.Id, display_name = u.DisplayName, username = u.Username, avatar_url = (string?)null })
            .ToList();
    }
}
