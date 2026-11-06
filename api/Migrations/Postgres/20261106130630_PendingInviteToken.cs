using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class PendingInviteToken : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TokenHash",
                schema: "splitshare",
                table: "PendingInvites",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_PendingInvites_TokenHash",
                schema: "splitshare",
                table: "PendingInvites",
                column: "TokenHash");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_PendingInvites_TokenHash",
                schema: "splitshare",
                table: "PendingInvites");

            migrationBuilder.DropColumn(
                name: "TokenHash",
                schema: "splitshare",
                table: "PendingInvites");
        }
    }
}
