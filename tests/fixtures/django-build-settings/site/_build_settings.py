# Used to compile static files while building the package. Never serves a request:
# only site/_build.py names this module, and manage.py names site.settings.
SECRET_KEY = "build-time-secret-key"
DEBUG = False
INSTALLED_APPS = ["django.contrib.staticfiles"]
