namespace Acme.AppHost;

public static class BuilderExtensions
{
    public static void AddStorage(IDistributedApplicationBuilder builder)
    {
        builder.AddAzureStorage("azurite").ConfigureInfrastructure(c =>
        {
            var blobStorage = c.GetProvisionableResources().OfType<BlobService>().SingleOrDefault();
            blobStorage?.CorsRules.Add(new BicepValue<StorageCorsRule>(new StorageCorsRule
            {
                AllowedOrigins = [new BicepValue<string>("*")],
                AllowedMethods = [CorsRuleAllowedMethod.Get]
            }));
        });
    }
}
