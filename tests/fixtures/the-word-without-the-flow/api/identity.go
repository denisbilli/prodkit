package api

import (
	"net/http"

	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
)

func SignIn(c echo.Context) error {
	if err := bcrypt.CompareHashAndPassword([]byte(storedHash(c)), []byte(c.FormValue("password"))); err != nil {
		return c.NoContent(http.StatusUnauthorized)
	}
	return c.JSON(http.StatusOK, map[string]any{
		"ForcePasswordReset": false,
		"Kdf":                0,
	})
}

func storedHash(c echo.Context) string { return "" }
