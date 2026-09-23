import csv

from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.http import HttpResponse
from django.shortcuts import render

from bookmarks.models import Bookmark


@staff_member_required
def users_csv(request):
    response = HttpResponse(content_type="text/csv")
    response["Content-Disposition"] = 'attachment; filename="users.csv"'
    delimiter = request.user.config.get("csv_delimiter") if request.user.is_authenticated else None
    writer = csv.writer(response, delimiter=delimiter or ",")
    for user in User.objects.all():
        writer.writerow([user.username, user.date_joined])
    return response


@login_required
def my_bookmarks(request):
    bookmarks = Bookmark.objects.filter(owner=request.user)
    return render(request, "bookmarks/index.html", {"bookmarks": bookmarks})
