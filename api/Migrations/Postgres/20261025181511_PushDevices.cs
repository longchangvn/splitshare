using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class PushDevices : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PushDevices",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Token = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Platform = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    MutedGroupIdsJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    LastSeenAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PushDevices", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PushDevices_UserId",
                schema: "splitshare",
                table: "PushDevices",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_PushDevices_UserId_Token",
                schema: "splitshare",
                table: "PushDevices",
                columns: new[] { "UserId", "Token" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PushDevices",
                schema: "splitshare");
        }
    }
}
