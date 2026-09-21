package org.example.samples.clinic;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class OwnerController {

    @GetMapping("/owners")
    public List<String> owners() {
        return List.of();
    }
}
