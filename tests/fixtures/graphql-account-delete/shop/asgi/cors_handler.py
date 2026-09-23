from fnmatch import fnmatchcase

from django.conf import settings


def origin_allowed(origin: str) -> bool:
    return any(fnmatchcase(origin, allowed) for allowed in settings.ALLOWED_GRAPHQL_ORIGINS)
