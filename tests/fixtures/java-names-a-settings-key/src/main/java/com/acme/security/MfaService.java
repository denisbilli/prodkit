package com.acme.security;

import java.util.Map;

public class MfaService {

    public static final String MFA_SECRET_KEY = "mfaSecret";

    public void enable(User user, String generated) {
        Map<String, String> settings = user.getSettings();
        settings.put(MFA_SECRET_KEY, generated);
    }

    public String secretFor(User user) {
        return user.getSettings().get(MFA_SECRET_KEY);
    }
}
