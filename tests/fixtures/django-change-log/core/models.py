from django.conf import settings
from django.db import models


class ObjectChange(models.Model):
    time = models.DateTimeField(auto_now_add=True, editable=False, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    user_name = models.CharField(max_length=150, editable=False)
    request_id = models.UUIDField(editable=False, db_index=True)
    action = models.CharField(max_length=50)
    changed_object_id = models.PositiveBigIntegerField()
    object_repr = models.CharField(max_length=200, editable=False)
    prechange_data = models.JSONField(editable=False, blank=True, null=True)
    postchange_data = models.JSONField(editable=False, blank=True, null=True)

    class Meta:
        ordering = ['-time']


class Site(models.Model):
    name = models.CharField(max_length=100)

    def to_objectchange(self, action):
        return ObjectChange(action=action, changed_object_id=self.pk, object_repr=str(self))
