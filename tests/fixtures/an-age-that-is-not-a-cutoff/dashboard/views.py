from datetime import timedelta

from django.shortcuts import get_object_or_404, render
from django.utils.timezone import now

from .models import Draft, Event


def recent(request):
    week = Event.objects.filter(created__gte=now() - timedelta(days=7))
    return render(request, "dashboard/recent.html", {"events": week})


def discard_draft(request, pk):
    get_object_or_404(Draft, pk=pk, owner=request.user).delete()
    return render(request, "dashboard/recent.html")
