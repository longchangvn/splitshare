using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SplitShare.Api.Migrations.Postgres;

public partial class GroupLifecycleStatus : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "Status",
            schema: "splitshare",
            table: "Groups",
            type: "character varying(16)",
            maxLength: 16,
            nullable: false,
            defaultValue: "opening");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "Status", schema: "splitshare", table: "Groups");
    }
}
