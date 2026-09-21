namespace Example.Mocking;

public sealed class Mock<T> where T : class
{
    private readonly List<string> calls = new();

    public void Record(string method) => calls.Add(method);

    public bool WasCalled(string method) => calls.Contains(method);
}
