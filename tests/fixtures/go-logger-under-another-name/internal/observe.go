package internal

import (
	"os"

	"github.com/rs/zerolog"
)

var shout = zerolog.New(os.Stderr).With().Timestamp().Logger()

func Delivered(target string) {
	shout.Info().Str("target", target).Msg("delivered")
}
