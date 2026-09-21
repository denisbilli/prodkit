package com.example.shop;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CatalogController {

    @GetMapping("/shop/products")
    public List<String> products() {
        return List.of();
    }
}
