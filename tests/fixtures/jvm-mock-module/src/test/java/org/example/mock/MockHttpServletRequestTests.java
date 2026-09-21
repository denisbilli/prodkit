package org.example.mock;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.example.mock.web.MockHttpServletRequest;
import org.junit.jupiter.api.Test;

class MockHttpServletRequestTests {

    @Test
    void storesAHeader() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Accept", "application/json");

        assertEquals("application/json", request.getHeader("Accept"));
    }
}
