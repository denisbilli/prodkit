from django.db import models


class Token(models.Model):
    key = models.CharField(max_length=40, unique=True, db_index=True)
    user = models.ForeignKey("auth.User", on_delete=models.CASCADE)
    expires = models.DateTimeField(blank=True, null=True)
    write_enabled = models.BooleanField(default=True)
