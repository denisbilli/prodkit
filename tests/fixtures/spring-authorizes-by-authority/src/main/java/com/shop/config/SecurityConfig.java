package com.shop.config;

import org.springframework.context.annotation.Bean;
import org.springframework.security.web.SecurityFilterChain;

public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity httpSecurity) throws Exception {
        httpSecurity.authorizeHttpRequests(registry -> registry
                .requestMatchers("/admin/**").hasAuthority("ADMIN")
                .anyRequest().authenticated());
        return httpSecurity.build();
    }
}
