package public

import (
	"net/http"
)

func Handler() http.Handler {
	options := Options{
		AllowedOrigins: []string{"*"},
	}
	return options.Build()
}

func ServeAsset(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "public, max-age=3600")
	http.ServeFile(w, r, assetPath(r.URL.Path))
}
