package api

import (
	"net/http"

	"example.com/relay/internal"
)

func Relay(w http.ResponseWriter, r *http.Request) {
	internal.Delivered(r.RemoteAddr)
	w.WriteHeader(http.StatusAccepted)
}
