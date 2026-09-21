// Package mock is half of what this library is for: it ships in the module.
package mock

import "sync"

type Call struct {
	Method    string
	Arguments []any
}

type Mock struct {
	mu    sync.Mutex
	Calls []Call
}

func (m *Mock) Called(method string, args ...any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Calls = append(m.Calls, Call{Method: method, Arguments: args})
}
