using System.Net;
using System.Text.Json;

namespace SplitShare.E2E;

/// <summary>
/// Happy-path journeys across <c>api/Endpoints/AuthEndpoints.cs</c>: register, login,
/// OTP sign-in, refresh rotation, logout, password reset, profile/password management,
/// email verification (code + link), contacts and account deletion.
/// </summary>
public sealed class AuthFlowE2E(E2eApiFactory api) : E2eTest(api)
{
    /// <summary>Last path segment of an emailed link (http://host/reset/&lt;token&gt;).</summary>
    private static string TokenFromLink(string link) => link.Split('?')[0].TrimEnd('/').Split('/').Last();

    [Fact]
    public async Task Register_Returns_Created_With_A_Full_Token_Pair()
    {
        var email = E2eClient.NewEmail();
        var password = E2eClient.NewPassword();
        var displayName = E2eClient.NewName("Tester");

        var resp = await Client.PostAsync("/api/v1/auth/register", new
        {
            Username = email,
            Email = email,
            DisplayName = displayName,
            Password = password,
        });
        var pair = await Client.ExpectAsync(resp, HttpStatusCode.Created);

        Assert.Equal("Bearer", E2eClient.Str(pair, "token_type"));
        Assert.True(pair.GetProperty("is_new_user").GetBoolean());
        Assert.Equal(0, pair.GetProperty("auto_joined_groups").GetArrayLength());
        Assert.False(string.IsNullOrEmpty(E2eClient.Str(pair, "access_token")));
        Assert.False(string.IsNullOrEmpty(E2eClient.Str(pair, "refresh_token")));

        var user = pair.GetProperty("user");
        var userId = user.GetProperty("user_id").GetGuid();
        Assert.NotEqual(Guid.Empty, userId);
        Assert.Equal(email, E2eClient.Str(user, "email"));
        Assert.Equal(email, E2eClient.Str(user, "username"));
        Assert.Equal(displayName, E2eClient.Str(user, "display_name"));
        Assert.True(user.GetProperty("has_password").GetBoolean());
        Assert.False(user.GetProperty("email_verified").GetBoolean());

        Client.ApplyPair(pair);
        var me = await Client.GetOkAsync("/api/v1/me");
        Assert.Equal(userId, me.GetProperty("user_id").GetGuid());
        Assert.Equal(displayName, E2eClient.Str(me, "display_name"));
    }

    [Fact]
    public async Task Login_Accepts_Username_Or_Email()
    {
        var email = E2eClient.NewEmail();
        var username = "u" + Guid.NewGuid().ToString("N")[..20]; // a-z0-9, 3-30 chars
        var password = E2eClient.NewPassword();
        var reg = await Client.PostAsync("/api/v1/auth/register", new
        {
            Username = username,
            Email = email,
            DisplayName = E2eClient.NewName("Tester"),
            Password = password,
        });
        var created = await Client.ExpectAsync(reg, HttpStatusCode.Created);
        var userId = created.GetProperty("user").GetProperty("user_id").GetGuid();

        var byEmail = NewClient();
        var pairEmail = await byEmail.LoginAsync(email, password);
        Assert.Equal(userId, pairEmail.GetProperty("user").GetProperty("user_id").GetGuid());
        Assert.False(pairEmail.GetProperty("is_new_user").GetBoolean());

        var byUsername = NewClient();
        var pairUsername = await byUsername.LoginAsync(username, password);
        Assert.Equal(userId, pairUsername.GetProperty("user").GetProperty("user_id").GetGuid());
        Assert.Equal(username, E2eClient.Str(pairUsername.GetProperty("user"), "username"));
    }

    [Fact]
    public async Task Logout_Revokes_The_Refresh_Token()
    {
        await Client.RegisterAsync();
        var refresh = Client.RefreshToken!;

        var logout = await Client.PostOkAsync("/api/v1/auth/logout", new { RefreshToken = refresh });
        Assert.Equal("ok", E2eClient.Str(logout, "status"));

        var dead = await Client.PostAsync("/api/v1/auth/refresh", new { RefreshToken = refresh });
        await Client.ExpectAsync(dead, HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Otp_Request_And_Verify_Signs_In_A_Fresh_Address()
    {
        var email = E2eClient.NewEmail();

        var request = await Client.PostOkAsync("/api/v1/auth/otp/request", new { Email = email });
        Assert.Equal("ok", E2eClient.Str(request, "status"));
        Assert.Equal(10, request.GetProperty("expires_in_minutes").GetInt32());
        Assert.Equal(60, request.GetProperty("resend_after_seconds").GetInt32());

        var code = Api.Emails.LatestCode(email);
        var pair = await Client.PostOkAsync("/api/v1/auth/otp/verify", new { Email = email, Code = code });
        Client.ApplyPair(pair);

        Assert.True(pair.GetProperty("is_new_user").GetBoolean());
        var user = pair.GetProperty("user");
        Assert.Equal(email, E2eClient.Str(user, "email"));
        Assert.True(user.GetProperty("email_verified").GetBoolean()); // link delivery = verified

        var me = await Client.GetOkAsync("/api/v1/me");
        Assert.Equal(email, E2eClient.Str(me, "email"));
        Assert.True(me.GetProperty("email_verified").GetBoolean());
    }

    [Fact]
    public async Task Refresh_Rotation_Invalidates_The_Old_Token()
    {
        await Client.RegisterAsync();
        var oldRefresh = Client.RefreshToken!;

        var pair = await Client.RefreshAsync();
        var newRefresh = E2eClient.Str(pair, "refresh_token");
        Assert.NotEqual(oldRefresh, newRefresh);
        Assert.False(string.IsNullOrEmpty(E2eClient.Str(pair, "access_token")));

        var me = await Client.GetOkAsync("/api/v1/me"); // new access token works
        Assert.Equal(Client.Email, E2eClient.Str(me, "email"));

        var dead = await Client.PostAsync("/api/v1/auth/refresh", new { RefreshToken = oldRefresh });
        await Client.ExpectAsync(dead, HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Forgot_Password_Mails_A_Reset_Link_That_Sets_A_New_Password()
    {
        var email = E2eClient.NewEmail();
        var password = E2eClient.NewPassword();
        await Client.RegisterAsync(email, password);

        var forgot = await Client.PostOkAsync("/api/v1/auth/forgot", new { Email = email });
        Assert.Equal("ok", E2eClient.Str(forgot, "status"));

        var link = Api.Emails.LatestLink(email, "/reset");
        Assert.Contains("/reset/", link);
        var next = E2eClient.NewPassword();
        var pair = await Client.PostOkAsync("/api/v1/auth/reset", new
        {
            Token = TokenFromLink(link),
            NewPassword = next,
        });
        Assert.False(string.IsNullOrEmpty(E2eClient.Str(pair, "access_token")));
        Assert.Equal(email, E2eClient.Str(pair.GetProperty("user"), "email"));

        var fresh = NewClient();
        var login = await fresh.LoginAsync(email, next);
        Assert.Equal(email, E2eClient.Str(login.GetProperty("user"), "email"));
    }

    [Fact]
    public async Task Me_Get_And_Patch_Roundtrip_The_Profile()
    {
        await Client.RegisterAsync();
        var before = await Client.GetOkAsync("/api/v1/me");
        var userId = before.GetProperty("user_id").GetGuid();

        var name = E2eClient.NewName("Renamed");
        var patched = await Client.PatchOkAsync("/api/v1/me", new
        {
            DisplayName = name,
            Phone = "+15550001111",
        });
        Assert.Equal(userId, patched.GetProperty("user_id").GetGuid());
        Assert.Equal(name, E2eClient.Str(patched, "display_name"));
        Assert.Equal("+15550001111", E2eClient.Str(patched, "phone"));

        var after = await Client.GetOkAsync("/api/v1/me");
        Assert.Equal(name, E2eClient.Str(after, "display_name"));
        Assert.Equal("+15550001111", E2eClient.Str(after, "phone"));
    }

    [Fact]
    public async Task Change_Password_Signs_In_With_The_New_One()
    {
        var email = E2eClient.NewEmail();
        var password = E2eClient.NewPassword();
        await Client.RegisterAsync(email, password);
        var next = E2eClient.NewPassword();

        var changed = await Client.PatchOkAsync("/api/v1/me/password", new
        {
            CurrentPassword = password,
            NewPassword = next,
        });
        Assert.Equal("ok", E2eClient.Str(changed, "status"));

        var fresh = NewClient();
        var login = await fresh.LoginAsync(email, next);
        Assert.Equal(email, E2eClient.Str(login.GetProperty("user"), "email"));
    }

    [Fact]
    public async Task Verify_Email_With_The_Mailed_Confirmation_Code()
    {
        var email = E2eClient.NewEmail();
        await Client.RegisterAsync(email);
        Assert.False((await Client.GetOkAsync("/api/v1/me")).GetProperty("email_verified").GetBoolean());

        var requested = await Client.PostOkAsync("/api/v1/me/verify-email/code");
        Assert.Equal("ok", E2eClient.Str(requested, "status"));
        Assert.Equal(10, requested.GetProperty("expires_in_minutes").GetInt32());

        var code = Api.Emails.LatestCode(email, "confirmation code");
        var user = await Client.PostOkAsync("/api/v1/me/verify-email/confirm", new { Code = code });
        Assert.True(user.GetProperty("email_verified").GetBoolean());
        Assert.Equal(email, E2eClient.Str(user, "email"));

        var me = await Client.GetOkAsync("/api/v1/me");
        Assert.True(me.GetProperty("email_verified").GetBoolean());
    }

    [Fact]
    public async Task Verify_Email_Link_Resend_Delivers_A_Confirmable_Url()
    {
        var email = E2eClient.NewEmail();
        await Client.RegisterAsync(email);

        // SendVerifyLinkAsync derives its 60 s cooldown from the link created at
        // registration, so the first resend is 429 until that window passes.
        var resp = await Client.PostAsync("/api/v1/me/verify-email/link", auth: true);
        if (resp.StatusCode == HttpStatusCode.TooManyRequests)
        {
            await Task.Delay(TimeSpan.FromSeconds(62));
            resp = await Client.PostAsync("/api/v1/me/verify-email/link", auth: true);
        }
        if (resp.StatusCode == HttpStatusCode.TooManyRequests)
        {
            await Task.Delay(TimeSpan.FromSeconds(5));
            resp = await Client.PostAsync("/api/v1/me/verify-email/link", auth: true);
        }
        var body = await Client.ExpectAsync(resp, HttpStatusCode.OK);
        Assert.Equal("ok", E2eClient.Str(body, "status"));

        var link = Api.Emails.LatestLink(email, "/verify");
        Assert.Contains("/verify/", link);
        var confirm = await Client.PostOkAsync("/api/v1/auth/verify-email", new { Token = TokenFromLink(link) });
        Assert.Equal("ok", E2eClient.Str(confirm, "status"));

        var me = await Client.GetOkAsync("/api/v1/me");
        Assert.True(me.GetProperty("email_verified").GetBoolean());
    }

    [Fact]
    public async Task Contacts_Search_Finds_A_Shared_Group_Member()
    {
        await Client.RegisterAsync();
        var peer = NewClient();
        var peerPair = await peer.RegisterAsync();
        var peerId = peerPair.GetProperty("user").GetProperty("user_id").GetGuid();
        var peerName = E2eClient.Str(peerPair.GetProperty("user"), "display_name");
        await E2eScenario.CreateGroupAsync(Client, peer);

        var found = await Client.GetOkAsync($"/api/v1/contacts?q={Uri.EscapeDataString(peerName)}");
        Assert.Equal(JsonValueKind.Array, found.ValueKind);
        var rows = found.EnumerateArray().ToList();
        var hit = Assert.Single(rows.Where(r => r.GetProperty("user_id").GetGuid() == peerId).ToList());
        Assert.Equal(peerName, E2eClient.Str(hit, "display_name"));
        Assert.Equal(peer.Email, E2eClient.Str(hit, "username"));
    }

    [Fact]
    public async Task Delete_Me_Without_An_Open_Balance_Kills_The_Session()
    {
        await Client.RegisterAsync();

        var deleted = await Client.DeleteOkAsync("/api/v1/me");
        Assert.Equal("ok", E2eClient.Str(deleted, "status"));

        // The user row is gone: the still-valid JWT resolves to no account.
        var resp = await Client.SendAsync(HttpMethod.Get, "/api/v1/me");
        await Client.ExpectAsync(resp, HttpStatusCode.Unauthorized);
    }
}
