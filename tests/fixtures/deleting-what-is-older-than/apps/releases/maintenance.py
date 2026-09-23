from datetime import timedelta

from django.conf import settings
from django.utils.timezone import now

from .models import Release


def cleanup_old_releases():
    days_ago = now() - timedelta(days=settings.RELEASE_RETENTION_DAYS)
    queryset = Release.objects.filter(created__lt=days_ago)
    queryset.delete()
