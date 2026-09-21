import os

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = False
ALLOWED_HOSTS = ["tickets.example.com"]

INSTALLED_APPS = ["django.contrib.auth", "tickets.orders"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware"]
