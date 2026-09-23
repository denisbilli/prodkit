package main

import (
	"net/http"

	"github.com/example/notes/internal/api"
)

func main() {
	http.ListenAndServe(":8080", api.Routes())
}
