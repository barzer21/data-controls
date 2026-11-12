
using DataControls.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DataControls.Api.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options)
        : base(options)
    {
    }

    public DbSet<Employee> Employees => Set<Employee>();
    public DbSet<Department> Departments => Set<Department>();
    public DbSet<SavedRule> Rules => Set<SavedRule>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<SavedRule>(entity =>
        {
            entity.ToTable("Rules", table =>
            {
                table.HasCheckConstraint("CK_Rules_ConditionJson", "ISJSON([ConditionJson]) = 1");
                table.HasCheckConstraint("CK_Rules_ResultFieldsJson", "[ResultFieldsJson] IS NULL OR ISJSON([ResultFieldsJson]) = 1");
            });
            entity.Property(r => r.Name).HasMaxLength(200);
            entity.Property(r => r.Description).HasMaxLength(2000);
        });

        modelBuilder.Entity<Employee>(entity =>
        {
            entity.Property(e => e.FirstName)
                .HasMaxLength(100);

            entity.Property(e => e.LastName)
                .HasMaxLength(100);

            entity.Property(e => e.Salary)
                .HasPrecision(18, 2);

            entity.HasOne(e => e.Department)
                .WithMany(d => d.Employees)
                .HasForeignKey(e => e.DepartmentId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Department>(entity =>
        {
            entity.Property(d => d.Name)
                .HasMaxLength(100);

            entity.Property(d => d.ManagerName)
                .HasMaxLength(100);
        });
    }
}
