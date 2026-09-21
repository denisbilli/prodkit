package setting

import "net/url"

type Cors struct {
	Enabled          bool
	AllowedOrigins   []string // FIXME: this option is from legacy code and should be removed
	allowedOrigins   []*url.URL
}
