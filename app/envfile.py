"""The env file scripts/register.py writes and the server reads.

The format is the one `docker run --env-file` reads: one NAME=value per
line, no quotes, lines starting with # ignored. A value is one line, so
the App's private key, a PEM of many lines, is written with its newlines
as the two characters backslash and n, and app/jwt.py turns them back.
The file holds the App's private key and webhook secret, so it is created
with mode 0600 before anything is written to it, and .gitignore and
.dockerignore keep it out of the repository and out of the image.
"""

import os

MODE = 0o600


def read(path):
    """The NAME=value pairs of an env file, as a dict, values untouched."""
    values = {}
    with open(path, encoding="utf-8") as handle:
        for line in handle:
            line = line.rstrip("\n")
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            name, sep, value = line.partition("=")
            if sep:
                values[name.strip()] = value
    return values


def load_into_environment(path, environ=None):
    """Put an env file's values into the environment, without replacing a
    value the environment already has, so a variable set on the command
    line wins over the file, as it does with docker."""
    environ = os.environ if environ is None else environ
    for name, value in read(path).items():
        environ.setdefault(name, value)


def write(path, values, header=None):
    """Write NAME=value lines to path with mode 0600. The mode is set on
    the open itself and again on the descriptor, so the secret is never in
    a file another user can read, not even an older file of the same name
    made with a looser mode."""
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, MODE)
    os.fchmod(descriptor, MODE)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
        if header:
            for line in header.splitlines():
                handle.write(f"# {line}\n")
        for name, value in values.items():
            if "\n" in str(value):
                raise ValueError(f"{name}: an env file value is one line")
            handle.write(f"{name}={value}\n")


def one_line(text):
    """A multi-line value, such as a PEM, as one env file line."""
    return text.strip("\n").replace("\n", "\\n")
