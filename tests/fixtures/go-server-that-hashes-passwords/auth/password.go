package auth

import "golang.org/x/crypto/bcrypt"

// CreatePassword returns a hashed version of the given password.
func CreatePassword(pw string, strength int) ([]byte, error) {
	return bcrypt.GenerateFromPassword([]byte(pw), strength)
}

// ComparePassword compares a hashed password with its possible plaintext equivalent.
func ComparePassword(hashed, pw []byte) bool {
	return bcrypt.CompareHashAndPassword(hashed, pw) == nil
}
