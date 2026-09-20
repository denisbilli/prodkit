import click

from transcriber import transcribe


@click.command()
@click.argument("path")
def main(path: str) -> None:
    click.echo(transcribe(path))


if __name__ == "__main__":
    main()
