// Package assert is the whole product: a module other modules import.
package assert

import "fmt"

func Equal(expected, actual any) error {
	if expected != actual {
		return fmt.Errorf("expected %v, got %v", expected, actual)
	}

	return nil
}
