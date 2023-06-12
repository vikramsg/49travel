#! /usr/bin/env bash

set -o errexit -o xtrace

black . --check --diff --config pyproject.toml

flake8 .

isort . --check

mypy .