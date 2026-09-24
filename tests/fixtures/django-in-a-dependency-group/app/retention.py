from datetime import timedelta

from django.utils.timezone import now as timezone_now

from app.models import Message


def archive_expired_messages(realm) -> int:
    check_date = timezone_now() - timedelta(days=realm.message_retention_days)
    expired = list(Message.objects.filter(realm=realm, date_sent__lt=check_date).values_list("id", flat=True))
    return archive(expired)
