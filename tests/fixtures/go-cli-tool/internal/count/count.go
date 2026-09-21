package count

// Helpers the command uses. The module still ships a program, not a library.
func Lines(text string) int {
	total := 0
	for _, r := range text {
		if r == '\n' {
			total++
		}
	}

	return total
}
