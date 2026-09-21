// Package testing carries the harness this module exports to its users.
package testing

type Harness struct {
	Name string
}

func New(name string) *Harness {
	return &Harness{Name: name}
}
