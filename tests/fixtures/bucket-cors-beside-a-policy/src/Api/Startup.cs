namespace Acme.Api;

public class Startup
{
    public void Configure(IApplicationBuilder app)
    {
        app.UseCors(policy => policy
            .WithOrigins("https://vault.acme.com")
            .AllowAnyMethod());
    }
}
