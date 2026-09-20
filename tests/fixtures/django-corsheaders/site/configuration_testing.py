######################################################################
#  A base configuration for the test suite. Not for production use.  #
######################################################################

SECRET_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789'

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": "inventory",
        "PASSWORD": "inventory",
    }
}
