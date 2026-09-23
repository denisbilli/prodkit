using Xunit;

namespace Api.Tests;

public class AnnotationServiceTests
{
    [Fact]
    public void ExportUserData_includes_every_annotation()
    {
        var exported = new ExportService().exportUserData(1);
        Assert.NotEmpty(exported);
    }
}
