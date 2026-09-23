package org.example.filter;

import io.netty.handler.codec.http.HttpHeaderNames;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.container.ContainerResponseContext;
import jakarta.ws.rs.container.ContainerResponseFilter;

public class CorsResponseFilter implements ContainerResponseFilter {

    private final String allowed = System.getenv("WEB_ORIGIN");

    @Override
    public void filter(ContainerRequestContext request, ContainerResponseContext response) {
        String origin = request.getHeaderString(HttpHeaderNames.ORIGIN.toString());
        if (origin != null && allowed != null && allowed.contains(origin)) {
            response.getHeaders().add(HttpHeaderNames.ACCESS_CONTROL_ALLOW_ORIGIN.toString(), origin);
        }
    }
}
