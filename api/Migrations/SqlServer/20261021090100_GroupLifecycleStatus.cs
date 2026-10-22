using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.SqlServer;

public partial class GroupLifecycleStatus : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Status",
            schema: "splitshare",
            table: "Groups",
            type: "nvarchar(16)",
            maxLength: 16,
            nullable: false,
            defaultValue: "opening");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Status", schema: "splitshare", table: "Groups");
    }
}
