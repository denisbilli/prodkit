var builder = WebApplication.CreateBuilder(args);

// Any origin, because the desktop clients are served from wherever the user put them.
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());
});

var app = builder.Build();

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { ok = true }));
app.MapGet("/items", () => Results.Ok(Array.Empty<string>()));
app.Run();
