from django.db import models


class Change(models.Model):
    time = models.DateTimeField(auto_now_add=True)
    prechange_data = models.JSONField(null=True)
    postchange_data = models.JSONField(null=True)
