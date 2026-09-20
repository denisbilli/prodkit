package client

import "net/http"

func New(base string) *http.Client {
	return http.DefaultClient
}
