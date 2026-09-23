from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect, render


@login_required
def close(request):
    user = request.user

    if request.method == "POST":
        if request.POST.get("confirmation") == user.email:
            user.delete()
            request.session.flush()
            return redirect("/accounts/login/?account-closed=1")

    return render(request, "accounts/close_account.html")
