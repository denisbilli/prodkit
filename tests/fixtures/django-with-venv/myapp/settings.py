import os

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = False
ALLOWED_HOSTS = ["example.com"]
INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes"]
