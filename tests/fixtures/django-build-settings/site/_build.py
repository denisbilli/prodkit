import os


def build():
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "site._build_settings")

    from django.core.management import call_command

    call_command("collectstatic", interactive=False)
