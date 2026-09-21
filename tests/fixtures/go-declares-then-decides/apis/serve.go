package apis

import "net/http"

type ServeConfig struct {
	CertificateDomains []string

	// AllowedOrigins is an optional list of CORS origins (default to "*").
	AllowedOrigins []string
}

func Serve(config ServeConfig, w http.ResponseWriter) {
	if len(config.AllowedOrigins) == 0 {
		config.AllowedOrigins = []string{"*"}
	}

	w.Header().Set("Access-Control-Allow-Origin", config.AllowedOrigins[0])
}
