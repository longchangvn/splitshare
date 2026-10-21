using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.SqlServer
{
    /// <inheritdoc />
    public partial class GroupCategories : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GroupCategories",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    GroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Key = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    IsDefault = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_GroupCategories", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_GroupCategories_GroupId",
                schema: "splitshare",
                table: "GroupCategories",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_GroupCategories_GroupId_Key",
                schema: "splitshare",
                table: "GroupCategories",
                columns: new[] { "GroupId", "Key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "GroupCategories",
                schema: "splitshare");
        }
    }
}
