namespace Core.Entities;

public class Event
{
    public Guid Id { get; set; }
    public DateTime Date { get; set; }
    public EventType Type { get; set; }
    public Guid? OrganizationId { get; set; }
    public string? IpAddress { get; set; }
    public Guid? ActingUserId { get; set; }
}
