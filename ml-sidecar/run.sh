#!/usr/bin/env bash
cd "$(dirname "$0")"
python -m uvicorn main:app --port 8000
