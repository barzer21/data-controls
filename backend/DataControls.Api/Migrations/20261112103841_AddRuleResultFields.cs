using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace DataControls.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddRuleResultFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ResultFieldsJson",
                table: "Rules",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Rules_ResultFieldsJson",
                table: "Rules",
                sql: "[ResultFieldsJson] IS NULL OR ISJSON([ResultFieldsJson]) = 1");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Rules_ResultFieldsJson",
                table: "Rules");

            migrationBuilder.DropColumn(
                name: "ResultFieldsJson",
                table: "Rules");
        }
    }
}
