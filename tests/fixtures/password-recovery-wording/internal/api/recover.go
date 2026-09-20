package api

import "net/http"

type RecoverParams struct {
	Email string `json:"email"`
}

func (a *API) Recover(w http.ResponseWriter, r *http.Request) error {
	params := &RecoverParams{}
	if params.Email == "" {
		return newBadRequestError("Password recovery requires an email")
	}
	return a.sendRecoveryMail(params.Email)
}
