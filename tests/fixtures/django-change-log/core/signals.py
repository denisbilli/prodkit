from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Site


@receiver(post_save, sender=Site)
def handle_changed_object(sender, instance, request=None, **kwargs):
    objectchange = instance.to_objectchange('update')
    objectchange.user = request.user
    objectchange.request_id = request.id
    objectchange.save()


def changelog_table(queryset):
    from .tables import ObjectChangeTable
    return ObjectChangeTable(queryset)
