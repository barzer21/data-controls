using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DataControls.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRuleAiOrigin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "CreatedWithAi",
                table: "Rules",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CreatedWithAi",
                table: "Rules");
        }
    }
}
