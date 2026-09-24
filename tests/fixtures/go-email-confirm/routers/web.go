package routers

import "net/http"

type Service struct {
	RegisterEmailConfirm bool
}

var service Service

func RequireActive(next http.Handler, isActive func(*http.Request) bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isActive(r) && service.RegisterEmailConfirm {
			http.Redirect(w, r, "/user/activate", http.StatusSeeOther)
			return
		}
		next.ServeHTTP(w, r)
	})
}
