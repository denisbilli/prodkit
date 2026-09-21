package com.example.lib;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;

/// Method-level authorization in a component that serves no requests: no filter
/// chain, and therefore none of Spring Security's response headers.
@Service
public class Pricing {

    @PreAuthorize("hasRole('ADMIN')")
    public long priceFor(String sku) {
        return 0L;
    }
}
