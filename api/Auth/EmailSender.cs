namespace SplitShare.Api.Auth;

/// <summary>Dev stub: logs emails. Prod swaps in SMTP (design decision 7).</summary>
public interface IEmailSender
{
    Task SendAsync(string to, string subject, string body);
}

public sealed class StubEmailSender(ILogger<StubEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string body)
    {
        logger.LogInformation("EMAIL to={To} subject={Subject} body={Body}", to, subject, body);
        return Task.CompletedTask;
    }
}
