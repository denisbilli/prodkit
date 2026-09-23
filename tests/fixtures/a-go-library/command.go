package flags

type Command struct {
	Use string
	Run func(args []string)
}

func (c *Command) Execute(args []string) {
	c.Run(args)
}
