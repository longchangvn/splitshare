using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;

namespace SplitShare.Api.Services;

/// <summary>
/// Stores mutating-POST responses by client-supplied Idempotency-Key so
/// offline retries replay the original response without duplicating money.
/// </summary>
public sealed class IdempotencyService(AppDbContext db)
{
    public async Task<(bool Replay, int Status, string Json)> TryReplayAsync(string key, string endpoint)
    {
        var row = await db.IdempotencyKeys.FindAsync(key, endpoint);
        return row is null ? (false, 0, "") : (true, row.ResponseStatus, row.ResponseJson);
    }

    public async Task StoreAsync(string key, string endpoint, int status, string json)
    {
        db.IdempotencyKeys.Add(new Models.IdempotencyKey
        {
            Key = key,
            Endpoint = endpoint,
            ResponseStatus = status,
            ResponseJson = json
        });
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Lost the race with a concurrent identical request: the winner's
            // row is authoritative; caller should re-read via TryReplayAsync.
        }
    }
}
