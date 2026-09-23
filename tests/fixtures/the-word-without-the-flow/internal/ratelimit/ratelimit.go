package ratelimit

import "time"

type Scope string

const (
	ScopeSignIn             Scope = "sign_in"
	ScopePasswordResetIP    Scope = "password_reset_ip"
	ScopePasswordResetEmail Scope = "password_reset_email"
)

var Limits = map[Scope]struct {
	Limit  int
	Window time.Duration
}{
	ScopeSignIn:             {Limit: 10, Window: time.Minute},
	ScopePasswordResetIP:    {Limit: 10, Window: time.Hour},
	ScopePasswordResetEmail: {Limit: 3, Window: time.Hour},
}
