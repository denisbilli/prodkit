package org.example.api;

import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

@Path("session")
public class SessionResource {

    @POST
    public Response add(@FormParam("email") String email, @FormParam("password") String password) {
        return Response.ok().build();
    }
}
