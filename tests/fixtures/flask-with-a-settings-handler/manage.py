#!/usr/bin/env python
"""Administrative commands, run as `python manage.py <command>`."""

import click

from app.server import create_app


@click.group()
def cli():
    pass


@cli.command()
def runserver():
    create_app().run()


if __name__ == "__main__":
    cli()
