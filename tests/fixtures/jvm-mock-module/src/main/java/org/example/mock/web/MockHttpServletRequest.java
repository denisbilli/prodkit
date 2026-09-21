package org.example.mock.web;

import java.util.HashMap;
import java.util.Map;

/// Shipped in the jar: this module's product is the mock, not a test of one.
public class MockHttpServletRequest {

    private final Map<String, String> headers = new HashMap<>();

    public void addHeader(String name, String value) {
        headers.put(name, value);
    }

    public String getHeader(String name) {
        return headers.get(name);
    }
}
