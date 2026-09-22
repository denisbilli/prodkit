package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/example/notifier/auth"
	"github.com/example/notifier/model"
)

// Only the owner of an application may rename or delete it. The row carries the user
// it belongs to; the token says who is asking.
func updateApplication(ctx *gin.Context, db model.Store) {
	app := db.GetApplicationByID(ctx.Param("id"))
	if app == nil || app.UserID != auth.GetUserID(ctx) {
		ctx.AbortWithStatus(http.StatusNotFound)
		return
	}
	db.UpdateApplication(app)
}

func deleteApplication(ctx *gin.Context, db model.Store) {
	app := db.GetApplicationByID(ctx.Param("id"))
	if app != nil && app.UserID == auth.GetUserID(ctx) {
		db.DeleteApplicationByID(app.ID)
		return
	}
	ctx.AbortWithStatus(http.StatusNotFound)
}
