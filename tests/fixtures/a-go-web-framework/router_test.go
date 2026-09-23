package router

import "testing"

func TestNew(t *testing.T) {
	if New() == nil {
		t.Fatal("nil router")
	}
}
