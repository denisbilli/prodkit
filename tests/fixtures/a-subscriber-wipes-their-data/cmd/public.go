package main

import (
	"net/http"

	"github.com/labstack/echo/v4"
)

func registerPublic(e *echo.Echo, a *App) {
	g := e.Group("")
	g.POST("/subscription/export/:subUUID", a.ExportSubscriberData)
	g.POST("/subscription/wipe/:subUUID", a.WipeSubscriberData)
}

func (a *App) WipeSubscriberData(c echo.Context) error {
	if err := a.core.DeleteSubscribersByUUID(c.Param("subUUID")); err != nil {
		return err
	}
	return c.NoContent(http.StatusNoContent)
}
