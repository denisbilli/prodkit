from django.core.management.base import BaseCommand

from app.models import Wedding


def anonymize_users_data(cutoff):
    """Strip the couple's details from weddings older than the retention window."""
    for wedding in Wedding.objects.filter(date__lt=cutoff):
        wedding.couple_email = None
        wedding.couple_phone = None
        wedding.save()


class Command(BaseCommand):
    def handle(self, *args, **options):
        anonymize_users_data(options["cutoff"])
