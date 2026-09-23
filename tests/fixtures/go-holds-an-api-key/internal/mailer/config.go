package mailer

import "os"

type Config struct {
	APIKey  string
	BaseURL string
}

func FromEnv() Config {
	return Config{APIKey: os.Getenv("MAILGUN_API_KEY"), BaseURL: "https://api.mailgun.net"}
}
