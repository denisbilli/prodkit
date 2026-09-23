using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

namespace Api.Controllers;

[ApiController]
[Route("api/account/2fa")]
public class TwoFactorController(UserManager<IdentityUser> userManager) : ControllerBase
{
    [HttpPost("enable")]
    public async Task<IActionResult> Enable(string code)
    {
        var user = await userManager.GetUserAsync(User);
        var valid = await userManager.VerifyTwoFactorTokenAsync(user!, userManager.Options.Tokens.AuthenticatorTokenProvider, code);
        if (!valid) return BadRequest();
        await userManager.SetTwoFactorEnabledAsync(user!, true);
        return Ok();
    }
}
