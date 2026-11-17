using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class StitchParity : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AppleSub",
                schema: "splitshare",
                table: "Users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DefaultCurrency",
                schema: "splitshare",
                table: "Users",
                type: "character varying(3)",
                maxLength: 3,
                nullable: false,
                defaultValue: "USD");

            migrationBuilder.AddColumn<string>(
                name: "FacebookId",
                schema: "splitshare",
                table: "Users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyExpenses",
                schema: "splitshare",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyInvites",
                schema: "splitshare",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "NotifyNudges",
                schema: "splitshare",
                table: "Users",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDefault",
                schema: "splitshare",
                table: "PaymentHandles",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                schema: "splitshare",
                table: "PaymentHandles",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "other");

            migrationBuilder.AddColumn<string>(
                name: "Category",
                schema: "splitshare",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: false,
                defaultValue: "other");

            migrationBuilder.AddColumn<string>(
                name: "CoverKey",
                schema: "splitshare",
                table: "Groups",
                type: "character varying(512)",
                maxLength: 512,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CoverMime",
                schema: "splitshare",
                table: "Groups",
                type: "character varying(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Emoji",
                schema: "splitshare",
                table: "Groups",
                type: "character varying(16)",
                maxLength: 16,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "InviteExpiresAt",
                schema: "splitshare",
                table: "Groups",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "InviteRequiresApproval",
                schema: "splitshare",
                table: "Groups",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "ExpenseItems",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpenseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    UnitCents = table.Column<long>(type: "bigint", nullable: false),
                    TotalCents = table.Column<long>(type: "bigint", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ExpenseItems_Expenses_ExpenseId",
                        column: x => x.ExpenseId,
                        principalSchema: "splitshare",
                        principalTable: "Expenses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ExpensePayers",
                schema: "splitshare",
                columns: table => new
                {
                    ExpenseId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaidCents = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpensePayers", x => new { x.ExpenseId, x.UserId });
                    table.ForeignKey(
                        name: "FK_ExpensePayers_Expenses_ExpenseId",
                        column: x => x.ExpenseId,
                        principalSchema: "splitshare",
                        principalTable: "Expenses",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "JoinRequests",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DecidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DecidedBy = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_JoinRequests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MemberRemovalAudits",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    RemovedUserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ActorId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UncollectedCents = table.Column<long>(type: "bigint", nullable: false),
                    DetailJson = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberRemovalAudits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExpenseItemAssignees",
                schema: "splitshare",
                columns: table => new
                {
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ExpenseItemAssignees", x => new { x.ItemId, x.UserId });
                    table.ForeignKey(
                        name: "FK_ExpenseItemAssignees_ExpenseItems_ItemId",
                        column: x => x.ItemId,
                        principalSchema: "splitshare",
                        principalTable: "ExpenseItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_AppleSub",
                schema: "splitshare",
                table: "Users",
                column: "AppleSub");

            migrationBuilder.CreateIndex(
                name: "IX_Users_FacebookId",
                schema: "splitshare",
                table: "Users",
                column: "FacebookId");

            migrationBuilder.CreateIndex(
                name: "IX_ExpenseItems_ExpenseId",
                schema: "splitshare",
                table: "ExpenseItems",
                column: "ExpenseId");

            migrationBuilder.CreateIndex(
                name: "IX_JoinRequests_GroupId_Status",
                schema: "splitshare",
                table: "JoinRequests",
                columns: new[] { "GroupId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_JoinRequests_GroupId_UserId",
                schema: "splitshare",
                table: "JoinRequests",
                columns: new[] { "GroupId", "UserId" });

            migrationBuilder.CreateIndex(
                name: "IX_MemberRemovalAudits_GroupId",
                schema: "splitshare",
                table: "MemberRemovalAudits",
                column: "GroupId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ExpenseItemAssignees",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "ExpensePayers",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "JoinRequests",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "MemberRemovalAudits",
                schema: "splitshare");

            migrationBuilder.DropTable(
                name: "ExpenseItems",
                schema: "splitshare");

            migrationBuilder.DropIndex(
                name: "IX_Users_AppleSub",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_Users_FacebookId",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "AppleSub",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "DefaultCurrency",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "FacebookId",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "NotifyExpenses",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "NotifyInvites",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "NotifyNudges",
                schema: "splitshare",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "IsDefault",
                schema: "splitshare",
                table: "PaymentHandles");

            migrationBuilder.DropColumn(
                name: "Kind",
                schema: "splitshare",
                table: "PaymentHandles");

            migrationBuilder.DropColumn(
                name: "Category",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "CoverKey",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "CoverMime",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "Emoji",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "InviteExpiresAt",
                schema: "splitshare",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "InviteRequiresApproval",
                schema: "splitshare",
                table: "Groups");
        }
    }
}
