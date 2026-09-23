from django.contrib.auth.decorators import login_required
from django.http import HttpResponse

from .exporter import export_netscape_html
from .models import Bookmark


@login_required
def bookmark_export(request):
    bookmarks = Bookmark.objects.filter(owner=request.user)
    response = HttpResponse(content_type="text/plain; charset=UTF-8")
    response["Content-Disposition"] = 'attachment; filename="bookmarks.html"'
    response.write(export_netscape_html(list(bookmarks)))
    return response
