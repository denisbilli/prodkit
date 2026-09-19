from config.settings.base import *

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
]

DEBUG = True
CSRF_COOKIE_SECURE = False
