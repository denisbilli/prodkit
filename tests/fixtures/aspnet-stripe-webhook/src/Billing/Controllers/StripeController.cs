using Microsoft.AspNetCore.Mvc;
using Stripe;

namespace Billing.Controllers;

[Route("stripe")]
public class StripeController : Controller
{
    private readonly BillingSettings _settings;

    public StripeController(BillingSettings settings) => _settings = settings;

    [HttpPost("webhook")]
    public async Task<IActionResult> PostWebhook()
    {
        using var sr = new StreamReader(HttpContext.Request.Body);
        var json = await sr.ReadToEndAsync();

        var parsed = EventUtility.ConstructEvent(
            json,
            Request.Headers["Stripe-Signature"],
            _settings.StripeWebhookSecret);

        await HandleAsync(parsed);
        return Ok();
    }
}
