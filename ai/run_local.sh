#!/bin/bash
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
fi

echo "Installing dependencies..."
.venv/bin/python -m pip install -r requirements.txt -q

echo "Starting FastAPI server at http://localhost:8000"
.venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000
