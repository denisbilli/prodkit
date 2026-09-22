import os

DEBUG = False
SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "api.authentication.TokenAuthentication",
    ),
}
