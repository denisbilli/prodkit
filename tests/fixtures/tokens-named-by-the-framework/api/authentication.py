from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from api.models import Token


class TokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header = get_authorization_header(request).decode()
        if not header.startswith("Token "):
            return None
        try:
            token = Token.objects.get(key=header.split()[1])
        except Token.DoesNotExist:
            raise AuthenticationFailed("Invalid token")
        return token.user, token
