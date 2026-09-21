package mock

import "testing"

func TestCalled(t *testing.T) {
	m := &Mock{}
	m.Called("Do", 1)

	if len(m.Calls) != 1 {
		t.Fatalf("expected one call, got %d", len(m.Calls))
	}
}
