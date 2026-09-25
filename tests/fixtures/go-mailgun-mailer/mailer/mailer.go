package mailer

import "github.com/mailgun/mailgun-go"

func SendReset(mg mailgun.Mailgun, to, link string) error {
	msg := mg.NewMessage("noreply@example.com", "Reset your password", "Follow "+link, to)
	_, _, err := mg.Send(msg)
	return err
}
