// Unity's own bundled package. A stripe here is a block of bytes being hashed.
internal static class xxHash3Avx2 {
    const int STRIPE_LEN = 64;
    const int SECRET_KEY_SIZE = 192;
    static unsafe void Accumulate(ulong* acc, byte* secret) {
        Avx2ScrambleAcc(acc, secret + SECRET_KEY_SIZE - STRIPE_LEN);
    }
}
