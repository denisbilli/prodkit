import os

SECRET_KEY = os.environ["DJANGO_SECRET_KEY"]
DEBUG = False
ALLOWED_HOSTS = [os.environ["ALLOWED_HOST"]]

# Security headers, set by the framework rather than by an Express package.
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
CSP_DEFAULT_SRC = ("'self'",)

INSTALLED_APPS = ["django.contrib.auth", "django.contrib.contenttypes", "csp"]
MIDDLEWARE = ["django.middleware.security.SecurityMiddleware", "csp.middleware.CSPMiddleware"]
