package main

import (
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: tally <file>")
		os.Exit(2)
	}

	fmt.Println("counting", os.Args[1])
}
