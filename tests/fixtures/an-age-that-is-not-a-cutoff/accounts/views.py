from datetime import timedelta

from django.shortcuts import redirect


def remember_me(request):
    response = redirect("/")
    response.set_cookie("remember", "1", max_age=timedelta(days=30).total_seconds())
    return response


def logout(request):
    response = redirect("/login/")
    response.delete_cookie("remember")
    return response
