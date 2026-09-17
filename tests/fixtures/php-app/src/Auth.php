<?php

// Invisible to the analyzer until PHP became a readable source extension: a published
// application was reported as missing authentication that was written right here.
class Auth
{
    public function login(string $email, string $password): bool
    {
        $hash = getenv('APP_KEY');
        return password_verify($password, $hash);
    }
}
