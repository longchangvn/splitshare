using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Data;
using SplitShare.Api.Models;

namespace SplitShare.Api.Groups;

public sealed class CategoryService(AppDbContext db)
{
    public const int MaxCategories = 40;
    public const int MaxNameLen = 40;

    public static readonly (string Key, string Name, int Order)[] Defaults =
    [
        ("food", "Food", 0),
        ("stay", "Stay", 1),
        ("transport", "Transport", 2),
        ("other", "Other", 3),
    ];

    private static readonly Regex SlugRe = new("[^a-z0-9]+", RegexOptions.Compiled);

    private async Task<GroupOp?> GuardWriteAsync(Guid actorId, Guid groupId)
    {
        var write = await new GroupStatusPolicy(db).CheckWriteAsync(groupId, actorId);
        return write.Allowed ? null : new GroupOp(false, write.ErrorCode, write.Error);
    }

    public static object Map(GroupCategory c) => new
    {
        category_id = c.Id,
        key = c.Key,
        name = c.Name,
        sort_order = c.SortOrder,
        is_default = c.IsDefault,
    };

    /// <summary>Ensure the 4 defaults exist and import any expense keys missing from the list.</summary>
    public async Task<List<GroupCategory>> EnsureAsync(Guid groupId)
    {
        var rows = await db.GroupCategories.Where(c => c.GroupId == groupId)
            .OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToListAsync();
        var keys = rows.Select(c => c.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var changed = false;

        foreach (var (key, name, order) in Defaults)
        {
            if (keys.Contains(key)) continue;
            var row = new GroupCategory
            {
                GroupId = groupId,
                Key = key,
                Name = name,
                SortOrder = order,
                IsDefault = true,
            };
            db.GroupCategories.Add(row);
            rows.Add(row);
            keys.Add(key);
            changed = true;
        }

        var used = await db.Expenses
            .Where(e => e.GroupId == groupId && e.DeletedAt == null && e.Category != null && e.Category != "")
            .Select(e => e.Category)
            .Distinct()
            .ToListAsync();
        var nextOrder = rows.Count == 0 ? 4 : rows.Max(c => c.SortOrder) + 1;
        foreach (var raw in used)
        {
            var key = raw.Trim().ToLowerInvariant();
            if (key.Length == 0 || keys.Contains(key)) continue;
            var label = char.ToUpperInvariant(key[0]) + (key.Length > 1 ? key[1..] : "");
            var row = new GroupCategory
            {
                GroupId = groupId,
                Key = key.Length <= 32 ? key : key[..32],
                Name = label.Length <= MaxNameLen ? label : label[..MaxNameLen],
                SortOrder = nextOrder++,
                IsDefault = false,
            };
            db.GroupCategories.Add(row);
            rows.Add(row);
            keys.Add(key);
            changed = true;
        }

        if (changed) await db.SaveChangesAsync();
        return rows.OrderBy(c => c.SortOrder).ThenBy(c => c.Name).ToList();
    }

    public async Task<string?> ValidateKeyAsync(Guid groupId, string? category)
    {
        if (category is null) return null;
        var key = category.Trim().ToLowerInvariant();
        if (key.Length is 0 or > 32) return "category key must be 1-32 chars.";
        var list = await EnsureAsync(groupId);
        return list.Any(c => c.Key == key)
            ? null
            : "category is not in this group's list.";
    }

    public async Task<GroupOp> ListAsync(Guid actorId, Guid groupId)
    {
        if (await db.GroupMembers.FindAsync(groupId, actorId) is null)
            return new(false, "FORBIDDEN", "Not a group member.");
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.DeletedAt is not null) return new(false, "NOT_FOUND", "Group not found.");
        var rows = await EnsureAsync(groupId);
        return new(true, null, null, rows.Select(Map).ToList());
    }

    public async Task<GroupOp> AddAsync(Guid actorId, Guid groupId, string? name)
    {
        if (await GuardWriteAsync(actorId, groupId) is { } denied) return denied;
        if (await db.GroupMembers.FindAsync(groupId, actorId) is null)
            return new(false, "FORBIDDEN", "Not a group member.");
        var g = await db.Groups.FindAsync(groupId);
        if (g is null || g.DeletedAt is not null) return new(false, "NOT_FOUND", "Group not found.");

        name = (name ?? "").Trim();
        if (name.Length is 0 or > MaxNameLen)
            return new(false, "VALIDATION", $"Name must be 1-{MaxNameLen} chars.");

        var rows = await EnsureAsync(groupId);
        if (rows.Count >= MaxCategories)
            return new(false, "VALIDATION", $"Category limit reached ({MaxCategories}).");
        if (rows.Any(c => c.Name.Equals(name, StringComparison.OrdinalIgnoreCase)))
            return new(false, "VALIDATION", "A category with that name already exists.");

        var key = await UniqueKeyAsync(groupId, Slugify(name));
        var row = new GroupCategory
        {
            GroupId = groupId,
            Key = key,
            Name = name,
            SortOrder = (rows.Count == 0 ? 0 : rows.Max(c => c.SortOrder) + 1),
            IsDefault = false,
        };
        db.GroupCategories.Add(row);
        await db.SaveChangesAsync();
        return new(true, null, null, Map(row));
    }

    public async Task<GroupOp> RenameAsync(Guid actorId, Guid groupId, Guid categoryId, string? name)
    {
        if (await GuardWriteAsync(actorId, groupId) is { } denied) return denied;
        if (await db.GroupMembers.FindAsync(groupId, actorId) is null)
            return new(false, "FORBIDDEN", "Not a group member.");
        name = (name ?? "").Trim();
        if (name.Length is 0 or > MaxNameLen)
            return new(false, "VALIDATION", $"Name must be 1-{MaxNameLen} chars.");

        var row = await db.GroupCategories.FirstOrDefaultAsync(c => c.Id == categoryId && c.GroupId == groupId);
        if (row is null) return new(false, "NOT_FOUND", "Category not found.");
        if (row.IsDefault)
            return new(false, "VALIDATION", "Default categories cannot be renamed.");

        var clash = await db.GroupCategories.AnyAsync(c =>
            c.GroupId == groupId && c.Id != categoryId && c.Name.ToLower() == name.ToLower());
        if (clash) return new(false, "VALIDATION", "A category with that name already exists.");

        row.Name = name;
        await db.SaveChangesAsync();
        return new(true, null, null, Map(row));
    }

    public async Task<GroupOp> DeleteAsync(Guid actorId, Guid groupId, Guid categoryId)
    {
        if (await GuardWriteAsync(actorId, groupId) is { } denied) return denied;
        if (await db.GroupMembers.FindAsync(groupId, actorId) is null)
            return new(false, "FORBIDDEN", "Not a group member.");

        var row = await db.GroupCategories.FirstOrDefaultAsync(c => c.Id == categoryId && c.GroupId == groupId);
        if (row is null) return new(false, "NOT_FOUND", "Category not found.");
        if (row.IsDefault)
            return new(false, "VALIDATION", "Default categories cannot be deleted.");

        var inUse = await db.Expenses.AnyAsync(e =>
            e.GroupId == groupId && e.DeletedAt == null && e.Category == row.Key);
        if (inUse)
            return new(false, "VALIDATION", "Category is used by expenses.");

        db.GroupCategories.Remove(row);
        await db.SaveChangesAsync();
        return new(true, null, null, new { status = "ok" });
    }

    public static string Slugify(string name)
    {
        var s = SlugRe.Replace(name.Trim().ToLowerInvariant(), "_").Trim('_');
        if (string.IsNullOrEmpty(s)) s = "cat";
        if (s.Length > 28) s = s[..28];
        return s;
    }

    private async Task<string> UniqueKeyAsync(Guid groupId, string baseKey)
    {
        var key = baseKey;
        var n = 2;
        while (await db.GroupCategories.AnyAsync(c => c.GroupId == groupId && c.Key == key))
        {
            var suffix = $"_{n++}";
            var stem = baseKey.Length + suffix.Length > 32
                ? baseKey[..(32 - suffix.Length)]
                : baseKey;
            key = stem + suffix;
        }
        return key;
    }
}
