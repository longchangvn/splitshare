using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Auth;
using SplitShare.Api.Common;
using SplitShare.Api.Data;
using SplitShare.Api.Expenses;
using SplitShare.Api.Services;

namespace SplitShare.Api.Endpoints;

/// <summary>Trip-pack: comments, nudges, activity, statement, export, breakdown, public share, capabilities.</summary>
public static class TripPackEndpoints
{
    private static Guid Me(ClaimsPrincipal p) => AuthEndpoints.CurrentUserId(p)!.Value;

    private static async Task<Dictionary<Guid, string>> NamesAsync(AppDbContext db, Guid groupId)
    {
        var ids = await db.GroupMembers.Where(m => m.GroupId == groupId).Select(m => m.UserId).ToListAsync();
        var arch = await db.MembershipArchives.Where(a => a.GroupId == groupId).Select(a => a.UserId).ToListAsync();
        var all = ids.Concat(arch).Distinct().ToList();
        return await db.Users.Where(u => all.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName);
    }

    public static void Map(RouteGroupBuilder api)
    {
        // ---- Comments ----
        api.MapGet("/expenses/{id:guid}/comments", async (Guid id, ClaimsPrincipal p,
            AppDbContext db, ExpenseService svc) =>
        {
            var detail = await svc.GetDetailAsync(Me(p), id);
            if (!detail.Ok) return Results.NotFound();
            var rows = await db.ExpenseComments.Where(c => c.ExpenseId == id)
                .OrderBy(c => c.CreatedAt).ToListAsync();
            var names = await NamesAsync(db, (await db.Expenses.FindAsync(id))!.GroupId);
            return Results.Ok(rows.Select(c => new
            {
                comment_id = c.Id, author_id = c.AuthorId,
                author_name = names.TryGetValue(c.AuthorId, out var n) ? n : "Unknown",
                body = c.Body, created_at = c.CreatedAt
            }).ToList());
        });

        api.MapPost("/expenses/{id:guid}/comments", async (Guid id, CommentDto d, ClaimsPrincipal p,
            AppDbContext db, ExpenseService svc) =>
        {
            var detail = await svc.GetDetailAsync(Me(p), id);
            if (!detail.Ok)
                return detail.ErrorCode == "FORBIDDEN"
                    ? ApiResults.Error("FORBIDDEN", "Not a group member.", 403)
                    : ApiResults.Error("NOT_FOUND", "Expense not found.", 404);
            if (string.IsNullOrWhiteSpace(d.Body) || d.Body.Trim().Length > 1000)
                return ApiResults.Error("VALIDATION", "body 1-1000 chars required.", 422);
            var c = new Models.ExpenseComment { ExpenseId = id, AuthorId = Me(p), Body = d.Body.Trim() };
            db.ExpenseComments.Add(c);
            await db.SaveChangesAsync();
            return Results.Created($"/api/v1/expenses/{id}/comments",
                new { comment_id = c.Id, body = c.Body, created_at = c.CreatedAt });
        });

        api.MapDelete("/comments/{id:guid}", async (Guid id, ClaimsPrincipal p, AppDbContext db) =>
        {
            var c = await db.ExpenseComments.FindAsync(id);
            if (c is null) return ApiResults.Error("NOT_FOUND", "Comment not found.", 404);
            var e = await db.Expenses.FindAsync(c.ExpenseId);
            if (e is null) return ApiResults.Error("NOT_FOUND", "Expense not found.", 404);
            var role = (await db.GroupMembers.FindAsync(e.GroupId, Me(p)))?.Role;
            if (c.AuthorId != Me(p) && role != "owner")
                return ApiResults.Error("FORBIDDEN", "Author or owner only.", 403);
            db.ExpenseComments.Remove(c);
            await db.SaveChangesAsync();
            return Results.Ok(new { status = "deleted" });
        });

        // ---- Nudges ----
        api.MapPost("/groups/{id:guid}/nudges", async (Guid id, NudgeDto d, ClaimsPrincipal p,
            AppDbContext db, LedgerService ledger, Groups.GroupService svc, IEmailSender mail) =>
        {
            var me = Me(p);
            if (await svc.RoleAsync(id, me) is null)
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var snapshot = await ledger.ComputeNetsAsync(id);
            if (snapshot is null) return ApiResults.Error("NOT_FOUND", "Group not found.", 404);
            var targets = (d.UserIds ?? []).Distinct().ToList();
            if (targets.Count is 0 or > 50) return ApiResults.Error("VALIDATION", "1-50 user_ids required.", 422);
            var cutoff = DateTime.UtcNow.AddDays(-1);
            var sent = new List<object>();
            var names = snapshot.Names;
            foreach (var t in targets)
            {
                if (t == me) continue;
                if (!snapshot.Nets.TryGetValue(t, out var net) || net >= 0) continue; // only debtors
                var recent = await db.Nudges.AnyAsync(n => n.GroupId == id && n.FromUserId == me
                    && n.ToUserId == t && n.CreatedAt >= cutoff);
                if (recent)
                    return ApiResults.Error("NUDGE_LIMIT",
                        $"Already nudged {names.GetValueOrDefault(t, "them")} in the last 24h.", 422);
                db.Nudges.Add(new Models.Nudge { GroupId = id, FromUserId = me, ToUserId = t });
                var addr = await db.Users.Where(u => u.Id == t).Select(u => u.Email).FirstOrDefaultAsync();
                var fromName = names.GetValueOrDefault(me, "A group member");
                if (addr is not null)
                {
                    try
                    {
                        await mail.SendAsync(addr, "Friendly nudge: settle up",
                            $"{fromName} nudged you to settle {Services.SettlementService.Fmt(-net, snapshot.Currency)}.");
                    }
                    catch { /* nudge mail is best-effort */ }
                }
                sent.Add(new { user_id = t });
            }
            await db.SaveChangesAsync();
            return Results.Ok(new { sent });
        });

        // ---- Activity ----
        api.MapGet("/groups/{id:guid}/activity", async (Guid id, int? limit, ClaimsPrincipal p,
            AppDbContext db, LedgerService ledger, Groups.GroupService svc) =>
        {
            if (!await ledger.CanViewAsync(id, Me(p)))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var take = Math.Clamp(limit ?? 50, 1, 200);
            var names = await NamesAsync(db, id);
            string N(Guid u) => names.TryGetValue(u, out var n) ? n : "Unknown";
            var feed = new List<object>();
            foreach (var e in await db.Expenses.Where(e => e.GroupId == id && e.DeletedAt == null)
                         .OrderByDescending(e => e.CreatedAt).Take(take).ToListAsync())
                feed.Add(new { kind = "expense", at = e.CreatedAt, text = $"{N(e.CreatedBy)} added “{e.Title}”", @ref = e.Id });
            foreach (var pay in await db.Payments.Where(x => x.GroupId == id)
                         .OrderByDescending(x => x.CreatedAt).Take(take).ToListAsync())
                feed.Add(new { kind = "payment", at = pay.CreatedAt, text = $"{N(pay.FromUserId)} paid {N(pay.ToUserId)} {(pay.AmountCents / 100m):0.00}", @ref = pay.Id });
            var expIds = await db.Expenses.Where(e => e.GroupId == id).Select(e => e.Id).ToListAsync();
            foreach (var c in await db.ExpenseComments.Where(c => expIds.Contains(c.ExpenseId))
                         .OrderByDescending(c => c.CreatedAt).Take(take).ToListAsync())
                feed.Add(new { kind = "comment", at = c.CreatedAt, text = $"{N(c.AuthorId)} commented", @ref = c.ExpenseId });
            foreach (var n in await db.Nudges.Where(n => n.GroupId == id)
                         .OrderByDescending(n => n.CreatedAt).Take(take).ToListAsync())
                feed.Add(new { kind = "nudge", at = n.CreatedAt, text = $"{N(n.FromUserId)} nudged {N(n.ToUserId)}", @ref = (Guid?)null });
            foreach (var m in await db.GroupMembers.Where(m => m.GroupId == id)
                         .OrderByDescending(m => m.JoinedAt).Take(take).ToListAsync())
                feed.Add(new { kind = "join", at = m.JoinedAt, text = $"{N(m.UserId)} joined", @ref = (Guid?)null });
            return Results.Ok(feed.OrderByDescending(f => ((dynamic)f).at).Take(take).ToList());
        });

        // ---- Statement ----
        api.MapGet("/groups/{id:guid}/statement/{uid:guid}", async (Guid id, Guid uid, ClaimsPrincipal p,
            AppDbContext db, LedgerService ledger) =>
        {
            if (!await ledger.CanViewAsync(id, Me(p)))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var names = await NamesAsync(db, id);
            var rows = new List<(DateTime At, object Row, long Delta)>();
            foreach (var e in await db.Expenses.Where(e => e.GroupId == id && e.DeletedAt == null)
                         .Include(e => e.Splits).ToListAsync())
            {
                if (e.PayerId == uid)
                    rows.Add((e.CreatedAt, new { kind = "paid", at = e.CreatedAt, title = e.Title, amount_cents = e.AmountCents }, e.AmountCents));
                var s = e.Splits.FirstOrDefault(x => x.UserId == uid);
                if (s is not null)
                    rows.Add((e.CreatedAt, new { kind = "share", at = e.CreatedAt, title = e.Title, amount_cents = s.ShareCents }, -s.ShareCents));
            }
            foreach (var pay in await db.Payments.Where(x => x.GroupId == id
                         && (x.FromUserId == uid || x.ToUserId == uid) && x.ReversedAt == null).ToListAsync())
            {
                if (pay.FromUserId == uid)
                    rows.Add((pay.CreatedAt, new { kind = "payment_out", at = pay.CreatedAt, title = $"Paid {names.GetValueOrDefault(pay.ToUserId, "?")}", amount_cents = pay.AmountCents }, pay.AmountCents));
                else
                    rows.Add((pay.CreatedAt, new { kind = "payment_in", at = pay.CreatedAt, title = $"Received from {names.GetValueOrDefault(pay.FromUserId, "?")}", amount_cents = pay.AmountCents }, -pay.AmountCents));
            }
            var ordered = rows.OrderBy(r => r.At).ToList();
            long run = 0;
            var entries = ordered.Select(r => { run += r.Delta; return new { entry = r.Row, running_cents = run }; }).ToList();
            return Results.Ok(new { user_id = uid, entries, closing_cents = run });
        });

        // ---- Breakdown ----
        api.MapGet("/groups/{id:guid}/breakdown", async (Guid id, ClaimsPrincipal p,
            AppDbContext db, LedgerService ledger) =>
        {
            if (!await ledger.CanViewAsync(id, Me(p)))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var rows = await db.Expenses.Where(e => e.GroupId == id && e.DeletedAt == null)
                .Include(e => e.Splits).ToListAsync();
            return Results.Ok(rows.GroupBy(e => e.Category).OrderBy(g => g.Key).Select(g => new
            {
                category = g.Key,
                expense_count = g.Count(),
                paid_cents = g.Sum(e => e.AmountCents),
                share_cents = g.SelectMany(e => e.Splits).Sum(s => s.ShareCents)
            }).ToList());
        });

        // ---- CSV export ----
        api.MapGet("/groups/{id:guid}/export.csv", async (Guid id, ClaimsPrincipal p,
            AppDbContext db, LedgerService ledger, Groups.GroupService svc) =>
        {
            if (!await ledger.CanViewAsync(id, Me(p)))
                return ApiResults.Error("FORBIDDEN", "Not a group member.", 403);
            var g = await db.Groups.FindAsync(id);
            var names = await NamesAsync(db, id);
            string N(Guid u) => names.TryGetValue(u, out var n) ? n : u.ToString();
            var sb = new StringBuilder();
            sb.AppendLine("section,type,title,date,payer_or_from,payee_or_to,amount,my_note,status");
            foreach (var e in await db.Expenses.Where(e => e.GroupId == id && e.DeletedAt == null)
                         .OrderBy(e => e.CreatedAt).ToListAsync())
                sb.AppendLine($"expense,,\"{Csv(e.Title)}\",{e.CreatedAt:O},{Csv(N(e.PayerId))},,{(e.AmountCents / 100m):0.00},{e.Status}");
            foreach (var pay in await db.Payments.Where(x => x.GroupId == id).OrderBy(x => x.CreatedAt).ToListAsync())
                sb.AppendLine($"payment,,\"{Csv(pay.Note ?? "Payment")}\",{pay.CreatedAt:O},{Csv(N(pay.FromUserId))},{Csv(N(pay.ToUserId))},{(pay.AmountCents / 100m):0.00},{pay.Status}");
            var summary = await ledger.BuildSummaryAsync(id);
            sb.AppendLine("section,member,paid,share,net");
            foreach (var m in summary ?? [])
                sb.AppendLine($"summary,\"{Csv(m.DisplayName)}\",{(m.TotalPaidCents / 100m):0.00},{(m.TotalShareCents / 100m):0.00},{(m.NetCents / 100m):0.00}");
            return Results.File(Encoding.UTF8.GetBytes(sb.ToString()), "text/csv", $"{g?.Name ?? "group"}-export.csv");
        });

        // ---- OCR (capability-gated stub) ----
        api.MapPost("/expenses/ocr", async (HttpRequest req, IOcrService ocr) =>
        {
            if (!ocr.Enabled) return ApiResults.Error("OCR_UNAVAILABLE", "Receipt scanning is not enabled.", 501);
            if (!req.HasFormContentType) return ApiResults.Error("VALIDATION", "multipart/form-data required.", 422);
            var form = await req.ReadFormAsync();
            if (form.Files.Count == 0) return ApiResults.Error("VALIDATION", "No file uploaded.", 422);
            await using var ms = new MemoryStream();
            await form.Files[0].CopyToAsync(ms);
            var fields = await ocr.ExtractAsync(ms.ToArray(), form.Files[0].ContentType);
            return Results.Ok(new { suggestion = fields });
        }).DisableAntiforgery();
    }

    private static string Csv(string s) => s.Replace("\"", "\"\"");

    /// <summary>Public surface: anonymous share page + capabilities. Mapped on the public v1 group.</summary>
    public static void MapPublic(RouteGroupBuilder v1)
    {
        v1.MapGet("/capabilities", (IOcrService ocr) =>
            Results.Ok(new { ocr_enabled = ocr.Enabled }));

        v1.MapGet("/shared/{token}", async (string token, AppDbContext db, LedgerService ledger) =>
        {
            var g = await db.Groups.FirstOrDefaultAsync(x => x.ShareToken == token && x.DeletedAt == null);
            if (g is null) return ApiResults.Error("NOT_FOUND", "Share link invalid.", 404);
            var snapshot = await ledger.ComputeNetsAsync(g.Id);
            if (snapshot is null) return ApiResults.Error("NOT_FOUND", "Group not found.", 404);
            var result = SettlementService.Compute(snapshot.Nets, snapshot.Names, snapshot.Currency, snapshot.RawDebts);
            var summary = await ledger.BuildSummaryAsync(g.Id);
            string N(Guid u) => snapshot.Names.TryGetValue(u, out var n) ? n : "Unknown";
            return Results.Ok(new
            {
                name = g.Name,
                currency = g.Currency,
                mode = g.Mode,
                members = (summary ?? []).Select(m => new
                {
                    display_name = m.DisplayName,
                    paid_cents = m.TotalPaidCents, share_cents = m.TotalShareCents, net_cents = m.NetCents
                }).ToList(),
                transfers = result.Transfers.Select(t => new
                {
                    from = N(t.FromUserId), to = N(t.ToUserId), amount_cents = t.AmountCents
                }).ToList()
            });
        });
    }

    public sealed record CommentDto(string Body);
    public sealed record NudgeDto(List<Guid>? UserIds);
}
