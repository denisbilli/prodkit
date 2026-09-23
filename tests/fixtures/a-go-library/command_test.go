package flags

import "testing"

func TestExecute(t *testing.T) {
	called := false
	(&Command{Use: "x", Run: func([]string) { called = true }}).Execute(nil)
	if !called {
		t.Fatal("not called")
	}
}
