package query

type GetUserByAPIKey struct {
	APIKey string
	Result *User
}

type User struct {
	ID   int
	Name string
}
