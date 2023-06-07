#!/usr/bin/env bash

set -o verbose

mypy .
isort .
black .
flake8 .