"""An ASGI wrapper that answers preflight requests from a fixed list of hosts."""

ALLOWED_HOSTS = ["storefront.example.com", "admin.example.com"]


async def handle(scope, receive, send, request_origin):
    origin_match = any(request_origin.endswith(host) for host in ALLOWED_HOSTS)

    response_headers = [
        (b"access-control-allow-methods", b"POST, OPTIONS"),
        (b"access-control-max-age", b"600"),
        (b"vary", b"Origin"),
    ]

    if origin_match:
        response_headers.append(
            (
                b"access-control-allow-origin",
                request_origin.encode("latin1"),
            )
        )

    await send({"type": "http.response.start", "status": 200 if origin_match else 400})
