package server

import (
	"github.com/gin-gonic/gin"

	"example.com/gallery/pkg/header"
)

func Static(router *gin.Engine) {
	router.Use(func(c *gin.Context) {
		c.Header(header.AccessControlAllowOrigin, header.Any)
		c.Next()
	})
}
