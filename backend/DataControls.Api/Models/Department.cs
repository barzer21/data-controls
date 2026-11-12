
namespace DataControls.Api.Models;

public class Department
{
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; }

    public string? ManagerName { get; set; }

    public ICollection<Employee> Employees { get; set; }
        = new List<Employee>();
}
