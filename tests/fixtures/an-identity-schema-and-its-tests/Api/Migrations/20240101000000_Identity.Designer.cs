using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;

namespace Api.Migrations
{
    partial class Identity
    {
        protected override void BuildTargetModel(ModelBuilder modelBuilder)
        {
            modelBuilder.Entity("Api.Entities.AppUser", b =>
                {
                    b.Property<int>("Id");
                    b.Property<string>("PasswordHash");
                    b.Property<bool>("TwoFactorEnabled")
                        .HasColumnType("INTEGER");
                    b.Property<string>("UserName");
                });
        }
    }
}
