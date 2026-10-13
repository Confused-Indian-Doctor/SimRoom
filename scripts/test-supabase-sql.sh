#!/usr/bin/env bash
set -euo pipefail
simroom_docker=(env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock)
simroom_container="simroom-sql-test-$$"
trap '"${simroom_docker[@]}" rm -f "$simroom_container" >/dev/null 2>&1' EXIT
"${simroom_docker[@]}" run --name "$simroom_container" -d -e POSTGRES_PASSWORD=local-test-only --mount "type=bind,src=$PWD,dst=/workspace,readonly" postgres:17-alpine >/dev/null
for ((i=0;i<60;i++)); do if "${simroom_docker[@]}" exec "$simroom_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi; sleep 0.5; done
"${simroom_docker[@]}" exec "$simroom_container" psql -U postgres -v ON_ERROR_STOP=1 -f /workspace/tests/supabase-bootstrap.sql -f /workspace/supabase/setup.sql -f /workspace/tests/supabase-rls.sql -f /workspace/tests/supabase-pairing.sql
