from django.contrib.auth.decorators import user_passes_test
from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404, redirect

from projects.models import Project


@user_passes_test(lambda u: u.is_staff)
def remove_user(request, pk):
    User.objects.get(pk=pk).delete()
    return redirect("/admin/users/")


def remove_project(request, code):
    user = request.user
    project = get_object_or_404(Project, code=code, owner=user)
    project.delete()
    return redirect("/projects/")
