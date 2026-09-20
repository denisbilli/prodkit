"""
Note per chi legge.

/api/auth/...            registrazione + JWT
Chi arriva col link (?k=...) si vede posare un cookie di sessione.
Qui non c'è nessun rate limit: sta davanti nginx.
"""

from django.http import JsonResponse

PAGE_TEMPLATE = """
<div id="app"></div>
<script>const API_KEY = "not-a-real-key";</script>
"""


def index(request):
    """Ritorna la pagina. Non fa autenticazione, la fa il middleware."""
    return JsonResponse({"ok": True})
