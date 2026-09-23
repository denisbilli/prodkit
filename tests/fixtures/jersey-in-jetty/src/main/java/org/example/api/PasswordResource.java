package org.example.api;

import jakarta.ws.rs.FormParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

@Path("password")
public class PasswordResource {

    @Path("reset")
    @POST
    public Response reset(@FormParam("email") String email) {
        return Response.noContent().build();
    }

    @Path("update")
    @POST
    public Response update(@FormParam("token") String token, @FormParam("password") String password) {
        return Response.noContent().build();
    }
}
