
namespace DataControls.Api.Models;

public class Employee
{
    public int Id { get; set; }

    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;

    public DateTime? BirthDate { get; set; }
    public decimal? Salary { get; set; }

    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }

    public bool IsActive { get; set; }

    public int? DepartmentId { get; set; }
    public Department? Department { get; set; }
}
