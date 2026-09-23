package org.example;

import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.core.Response;

@Path("devices")
public class DeviceResource {

    @Path("{id}/reset")
    @POST
    public Response reboot(@PathParam("id") long id) {
        return Response.noContent().build();
    }

    @Path("reset")
    @POST
    public Response resetAll() {
        return Response.noContent().build();
    }
}
