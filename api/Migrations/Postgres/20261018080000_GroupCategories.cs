using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.Postgres
{
    /// <inheritdoc />
    public partial class GroupCategories : Migration // Designer pairs with this
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "GroupCategories",
                schema: "splitshare",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    Name = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
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
