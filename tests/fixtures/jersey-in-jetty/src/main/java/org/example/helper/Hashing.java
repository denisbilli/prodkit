package org.example.helper;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.GeneralSecurityException;

public final class Hashing {

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";

    private Hashing() {
    }

    public static byte[] hash(char[] password, byte[] salt) throws GeneralSecurityException {
        PBEKeySpec spec = new PBEKeySpec(password, salt, 1000, 24 * 8);
        return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
    }
}
