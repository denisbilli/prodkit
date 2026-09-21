package org.example.mock.web;

import java.util.HashMap;
import java.util.Map;

public class MockHttpSession {

    private final Map<String, Object> attributes = new HashMap<>();

    public void setAttribute(String name, Object value) {
        attributes.put(name, value);
    }
}
