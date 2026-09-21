package com.shop.controller;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

public class OrderController {
    @RequestMapping(value = "/login", method = RequestMethod.POST)
    public Object login(String username, String password) {
        return adminService.login(username, password);
    }
}
