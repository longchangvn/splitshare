using Microsoft.EntityFrameworkCore;
using SplitShare.Api.Models;

namespace SplitShare.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<GroupMember> GroupMembers => Set<GroupMember>();
    public DbSet<Expense> Expenses => Set<Expense>();
    public DbSet<ExpenseSplit> ExpenseSplits => Set<ExpenseSplit>();
    public DbSet<ExpenseImage> ExpenseImages => Set<ExpenseImage>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<SettlementPlan> SettlementPlans => Set<SettlementPlan>();
    public DbSet<ExpenseAudit> ExpenseAudits => Set<ExpenseAudit>();
    public DbSet<IdempotencyKey> IdempotencyKeys => Set<IdempotencyKey>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<PasswordResetToken> PasswordResetTokens => Set<PasswordResetToken>();
    public DbSet<EmailVerificationToken> EmailVerificationTokens => Set<EmailVerificationToken>();
    public DbSet<PendingInvite> PendingInvites => Set<PendingInvite>();
    public DbSet<MembershipArchive> MembershipArchives => Set<MembershipArchive>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        // Dedicated schema: the module_platform database is shared with a
        // platform system (own Users/__EFMigrationsHistory tables). Never use public.
        b.HasDefaultSchema("splitshare");
        b.Entity<User>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.Username).IsUnique();
            e.HasIndex(x => x.Email).IsUnique();
            e.Property(x => x.Username).HasMaxLength(30);
            e.Property(x => x.Email).HasMaxLength(320);
            e.Property(x => x.DisplayName).HasMaxLength(50);
        });
        b.Entity<Group>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.InviteToken).IsUnique();
            e.Property(x => x.Name).HasMaxLength(50);
            e.Property(x => x.Currency).HasMaxLength(3);
            e.HasMany(x => x.Members).WithOne().HasForeignKey(m => m.GroupId);
        });
        b.Entity<GroupMember>(e =>
        {
            e.HasKey(x => new { x.GroupId, x.UserId });
        });
        b.Entity<Expense>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.GroupId);
            e.Property(x => x.Title).HasMaxLength(100);
            e.Property(x => x.Description).HasMaxLength(1000);
            e.HasMany(x => x.Splits).WithOne().HasForeignKey(s => s.ExpenseId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(x => x.Images).WithOne().HasForeignKey(i => i.ExpenseId).OnDelete(DeleteBehavior.Cascade);
        });
        b.Entity<ExpenseSplit>(e =>
        {
            e.HasKey(x => new { x.ExpenseId, x.UserId });
            e.Property(x => x.Percent).HasPrecision(5, 2); // explicit: no silent truncation on any provider
        });
        b.Entity<ExpenseImage>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ExpenseId);
            e.Property(x => x.StorageKey).HasMaxLength(512);
            e.Property(x => x.Mime).HasMaxLength(64);
        });
        b.Entity<Payment>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.GroupId);
            e.Property(x => x.Method).HasMaxLength(16);
            e.Property(x => x.Note).HasMaxLength(280);
        });
        b.Entity<SettlementPlan>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.GroupId, x.VersionSeq }).IsUnique();
            e.Property(x => x.InputsHash).HasMaxLength(128);
        });
        b.Entity<ExpenseAudit>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.ExpenseId);
        });
        b.Entity<IdempotencyKey>(e =>
        {
            e.HasKey(x => new { x.Key, x.Endpoint });
        });
        b.Entity<RefreshToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
            e.HasIndex(x => x.UserId);
        });
        b.Entity<PasswordResetToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
        });
        b.Entity<EmailVerificationToken>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => x.TokenHash).IsUnique();
        });
        b.Entity<PendingInvite>(e =>
        {
            e.HasKey(x => x.Id);
            e.HasIndex(x => new { x.GroupId, x.Email }).IsUnique();
        });
        b.Entity<MembershipArchive>(e =>
        {
            e.HasKey(x => new { x.GroupId, x.UserId });
        });
    }
}
