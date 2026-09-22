package api

import "github.com/gin-gonic/gin"

func Router() *gin.Engine {
	r := gin.Default()
	r.POST("/client", createClient)
	r.GET("/application", listApplications)
	r.POST("/message", pushMessage)
	return r
}

func createClient(c *gin.Context)      {}
func listApplications(c *gin.Context)  {}
func pushMessage(c *gin.Context)       {}
