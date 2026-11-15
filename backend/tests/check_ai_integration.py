"""Read-only HTTP checks against a temporary .NET API and Python service."""

import argparse
from copy import deepcopy
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def free_port():
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        return probe.getsockname()[1]


def call(url, body=None):
    request = Request(
        url,
        data=None if body is None else json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="GET" if body is None else "POST",
    )
    try:
        response = urlopen(request, timeout=20)
    except HTTPError as error:
        response = error
    with response:
        return response.status, json.load(response)


def wait_ready(url, process):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError("A test service failed to start. Check the temporary logs.")
        try:
            if call(url)[0] == 200:
                return
        except (URLError, TimeoutError):
            time.sleep(0.1)
    raise RuntimeError("A test service did not become ready.")


def stop(process):
    if process is not None and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-dll", type=Path, required=True)
    args = parser.parse_args()
    api_dll = args.api_dll.resolve()
    if not api_dll.is_file():
        parser.error("Build the API first and supply its DLL path.")

    root = Path(__file__).resolve().parents[2]
    python_port = free_port()
    api_port = free_port()
    while api_port == python_port:
        api_port = free_port()
    python_url = f"http://127.0.0.1:{python_port}"
    api_url = f"http://127.0.0.1:{api_port}"
    logs = Path(tempfile.mkdtemp(prefix="data-controls-ai-integration-"))
    print("Test logs:", logs, flush=True)
    python_process = api_process = server = None
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

    with (logs / "python.log").open("w", encoding="utf-8") as python_log, (
        logs / "api.log"
    ).open("w", encoding="utf-8") as api_log:
        try:
            python_process = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "api:app", "--app-dir",
                 str(root / "python-ai"), "--host", "127.0.0.1", "--port", str(python_port)],
                stdout=python_log, stderr=subprocess.STDOUT, creationflags=flags,
            )
            wait_ready(python_url + "/openapi.json", python_process)
            environment = os.environ.copy()
            environment["ASPNETCORE_ENVIRONMENT"] = "Development"
            environment["AiService__BaseUrl"] = python_url + "/"
            def start_api():
                return subprocess.Popen(
                    ["dotnet", str(api_dll), "--contentRoot", str(root / "backend/DataControls.Api"),
                     "--urls", api_url],
                    env=environment, stdout=api_log, stderr=subprocess.STDOUT, creationflags=flags,
                )

            api_process = start_api()
            wait_ready(api_url + "/api/metadata", api_process)
            before_status, before_rules = call(api_url + "/api/rules?pageSize=100")
            assert before_status == 200
            endpoint = api_url + "/api/ai/proposals"

            examples = [
                ("מצאי עובדים שתאריך סיום ההעסקה שלהם מוקדם מתאריך תחילת ההעסקה.", "comparison"),
                ("מצאי עובדים שהשכר שלהם גבוה מ-15000.", "comparison"),
                ("מצאי עובדים פעילים שהשכר שלהם גבוה מ-15000.", "group"),
                ("מצאי עובדים פעילים שהמחלקה שלהם לא פעילה.", "group"),
                ("מצאי עובדים שחסר להם שם פרטי או שכר.", "group"),
            ]
            valid_proposal = None
            for description, kind in examples:
                status, proposal = call(endpoint, {"description": description})
                assert status == 200, (status, proposal)
                assert proposal["rootEntityId"] == "employee" and proposal["condition"]["kind"] == kind
                valid_proposal = proposal
            print("PASS: five live .NET -> Python -> .NET proposals.", flush=True)

            for body in [{}, {"description": ""}, {"description": "   "},
                         {"description": "x" * 2001}, {"description": 123},
                         {"description": "unsupported"},
                         {"description": examples[0][0], "metadata": {}}]:
                status, _ = call(endpoint, body)
                assert status == 400, (body, status)
            print("PASS: input validation, unsupported text, client-supplied metadata rejected.", flush=True)

            stop(python_process)
            state = {"mode": "malformed"}

            class UpstreamHandler(BaseHTTPRequestHandler):
                def log_message(self, *unused):
                    pass

                def do_POST(self):
                    self.rfile.read(int(self.headers.get("Content-Length", 0)))
                    mode = state["mode"]
                    status = 200
                    if mode == "timeout":
                        time.sleep(16)
                    if mode == "malformed":
                        payload = b"not json"
                    elif mode == "invalid-rule":
                        invalid = deepcopy(valid_proposal)
                        invalid["rootEntityId"] = "unknownEntity"
                        payload = json.dumps(invalid).encode("utf-8")
                    else:
                        status = {"rejected": 400, "contract-error": 422, "unavailable": 500}.get(mode, 200)
                        payload = b'{"detail":"INTERNAL_DETAILS_MUST_NOT_LEAK"}'
                    try:
                        self.send_response(status)
                        self.send_header("Content-Type", "application/json")
                        self.send_header("Content-Length", str(len(payload)))
                        self.end_headers()
                        self.wfile.write(payload)
                    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                        pass

            class TestUpstream(ThreadingHTTPServer):
                allow_reuse_address = True
                daemon_threads = True

            # Use fresh ports: Windows can reserve a stopped server's port temporarily.
            server = TestUpstream(("127.0.0.1", 0), UpstreamHandler)
            threading.Thread(target=server.serve_forever, daemon=True).start()
            stop(api_process)
            environment["AiService__BaseUrl"] = f"http://127.0.0.1:{server.server_port}/"
            api_url = f"http://127.0.0.1:{free_port()}"
            endpoint = api_url + "/api/ai/proposals"
            api_process = start_api()
            wait_ready(api_url + "/api/metadata", api_process)
            for mode, expected in [("malformed", 502), ("invalid-rule", 502), ("rejected", 400),
                                   ("contract-error", 502), ("unavailable", 503), ("timeout", 504)]:
                state["mode"] = mode
                status, problem = call(endpoint, {"description": examples[1][0]})
                assert status == expected, (mode, status, problem)
                assert problem["title"] and "INTERNAL_DETAILS_MUST_NOT_LEAK" not in json.dumps(problem)
            server.shutdown()
            server.server_close()
            server = None
            status, _ = call(endpoint, {"description": examples[1][0]})
            assert status == 503, status
            after_status, after_rules = call(api_url + "/api/rules?pageSize=100")
            assert after_status == 200 and before_rules == after_rules, "Saved rules changed."
            print("PASS: upstream errors, invalid proposal, timeout, offline service; saved rules unchanged.", flush=True)
        finally:
            if server is not None:
                server.shutdown()
                server.server_close()
            stop(api_process)
            stop(python_process)


if __name__ == "__main__":
    main()
