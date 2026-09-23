package org.example.api;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.List;

@Path("devices")
@Produces(MediaType.APPLICATION_JSON)
public class DeviceResource {

    @GET
    public List<String> get() {
        return List.of("tracker-1", "tracker-2");
    }
}
