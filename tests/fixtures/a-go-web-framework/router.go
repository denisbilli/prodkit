package router

import "net/http"

type Router struct{ mux *http.ServeMux }

func New() *Router { return &Router{mux: http.NewServeMux()} }

func (r *Router) Handle(path string, h http.HandlerFunc) { r.mux.HandleFunc(path, h) }

func (r *Router) Run(addr string) error { return http.ListenAndServe(addr, r.mux) }
