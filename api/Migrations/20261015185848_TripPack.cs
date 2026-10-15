using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations
{
    /// <inheritdoc />
    public partial class TripPack : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProofRef",
                schema: "splitshare",
                table: "Payments",
                type: "character varying(140)",
                maxLength: 140,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "BudgetAlertPct",
                schema: "splitshare",
                table: "Groups",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<long>(
                name: "BudgetCents",
                schema: "splitshare",
                table: "Groups",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "FlatFeeCents",
                schema: "splitshare",
                table: "Groups",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Mode",
                schema: "splitshare",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ShareToken",
                schema: "splitshare",
                table: "Groups",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "DepositPaid",
                schema: "splitshare",
                table: "GroupMembers",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Category",
                schema: "splitshare",
                table: "Expenses",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "FeeCents",
                schema: "splitshare",
                table: "Expenses",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<decimal>(
                name: "FxRate",
                schema: "splitshare",
                table: "Expenses",
                type: "numeric(18,8)",
                precision: 18,
                scale: 8,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "OrigAmountCents",
                schema: "splitshare",
                table: "Expenses",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "OrigCurrency",
                schema: "splitshare",
                table: "Expenses",
                type: "character varying(3)",
                maxLength: 3,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SpentAt",
                schema: "splitshare",
                table: "Expenses",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<long>(
                name: "TaxCents",
                schema: "splitshare",
                table: "Expenses",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<long>(
                name: "TipCents",
                schema: "splitshare",
                table: "Expenses",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "ExpenseComments",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpenseId = table.Column<Guid>(type: "uuid", nullable: false),
                    AuthorId = table.Column<Guid>(type: "uuid", nullable: false),
                    Body = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseComments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExpenseGuests",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpenseId = table.Column<Guid>(type: "uuid", nullable: false),
                    CoveredByUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ShareCents = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseGuests", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExpenseGuests_Expenses_ExpenseId",
                        column: x => x.ExpenseId,
                        principalSchema: "splitshare",
                        principalTable: "Expenses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Nudges",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Nudges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentHandles",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Label = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Details = table.Column<string>(type: "character varying(280)", maxLength: 280, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentHandles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PaymentProofs",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentId = table.Column<Guid>(type: "uuid", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    Mime = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    UploadedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentProofs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RecurringRules",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AmountCents = table.Column<long>(type: "bigint", nullable: false),
                    SplitType = table.Column<int>(type: "integer", nullable: false),
                    PayerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParticipantIdsJson = table.Column<string>(type: "text", nullable: false),
                    Frequency = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    NextRunAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastRunAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecurringRules", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseComments_ExpenseId",
                schema: "splitshare",
                table: "ExpenseComments",
                column: "ExpenseId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseGuests_ExpenseId",
                schema: "splitshare",
                table: "ExpenseGuests",
                column: "ExpenseId");

            migrationBuilder.CreateIndex(
                name: "IX_Nudges_GroupId_FromUserId_ToUserId_CreatedAt",
                schema: "splitshare",
                table: "Nudges",
                columns: new[] { "GroupId", "FromUserId", "ToUserId", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentHandles_UserId",
                schema: "splitshare",
                table: "PaymentHandles",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProofs_PaymentId",
                schema: "splitshare",
                table: "PaymentProofs",
                column: "PaymentId");

            migrationBuilder.CreateIndex(
                name: "IX_RecurringRules_GroupId",
                schema: "splitshare",
                table: "RecurringRules",
                column: "GroupId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExpenseComments",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "ExpenseGuests",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "Nudges",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "PaymentHandles",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "PaymentProofs",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "RecurringRules",
                schema: "splitshare");

            migrationBuilder.DropColumn(
                name: "ProofRef",
                schema: "splitshare",
                table: "Payments");

            migrationBuilder.DropColumn(
                name: "BudgetAlertPct",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "BudgetCents",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "FlatFeeCents",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Mode",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "ShareToken",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "DepositPaid",
                schema: "splitshare",
                table: "GroupMembers");

            migrationBuilder.DropColumn(
                name: "Category",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "FeeCents",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "FxRate",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "OrigAmountCents",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "OrigCurrency",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "SpentAt",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "TaxCents",
                schema: "splitshare",
                table: "Expenses");

            migrationBuilder.DropColumn(
                name: "TipCents",
                schema: "splitshare",
                table: "Expenses");
        }
    }
}
