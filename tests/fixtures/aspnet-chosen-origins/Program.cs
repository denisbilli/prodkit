var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .WithOrigins("https://app.example.com", "https://admin.example.com")
        .AllowAnyHeader()
        .AllowAnyMethod());
});

var app = builder.Build();

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { ok = true }));
app.MapGet("/items", () => Results.Ok(Array.Empty<string>()));
app.Run();
