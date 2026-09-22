package router

import (
	"net/http"

	"github.com/rs/zerolog/log"
)

func Handle(w http.ResponseWriter, r *http.Request) {
	if err := deliver(r); err != nil {
		log.Error().Err(err).Msg("Error delivering message")
		w.WriteHeader(http.StatusInternalServerError)
		return
	}

	log.Info().Str("client", r.RemoteAddr).Msgf("delivered to %s", r.RemoteAddr)
	w.WriteHeader(http.StatusOK)
}
