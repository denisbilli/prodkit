package com.example.shop;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    // The default header writers come with this chain: nosniff, DENY, no-store.
    @Bean
    public SecurityFilterChain chain(HttpSecurity http) throws Exception {
        http
            .securityMatcher("/shop/**")
            .authorizeHttpRequests(requests -> requests.anyRequest().authenticated())
            .formLogin(login -> login.loginPage("/login").permitAll());

        return http.build();
    }
}
