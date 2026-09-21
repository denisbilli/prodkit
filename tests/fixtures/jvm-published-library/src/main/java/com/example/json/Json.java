package com.example.json;

import java.util.Map;

/// A serialiser published to Maven Central. Nothing here serves a request.
public final class Json {

    private Json() {
    }

    public static String write(Map<String, Object> values) {
        return values.toString();
    }
}
