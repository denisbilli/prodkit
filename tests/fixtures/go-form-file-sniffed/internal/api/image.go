package api

import (
	"net/http"
	"path/filepath"

	"github.com/gin-gonic/gin"
	"github.com/h2non/filetype"
)

func UploadImage(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	head := make([]byte, 261)
	open, _ := file.Open()
	open.Read(head)
	if !filetype.IsImage(head) {
		c.AbortWithStatus(http.StatusBadRequest)
		return
	}
	if err := c.SaveUploadedFile(file, filepath.Join("images", file.Filename)); err != nil {
		c.AbortWithStatus(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusCreated)
}
