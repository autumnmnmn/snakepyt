import socket
import ssl
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = 'localhost'
PORT = 1313
BASE_DIR = Path("./webui").resolve()

ROUTES = {
    "/": "content/main.html",
}

MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".ico": "image/x-icon"
}

SSL_CERT = "/home/ponder/ponder/certs/cert.pem"
SSL_KEY = "/home/ponder/ponder/certs/key.pem"

def guess_mime_type(path):
    return MIME_TYPES.get(Path(path).suffix, "application/octet-stream")

def build_response(status_code, body=b"", content_type="text/plain"):
    reason = {
        200: "OK",
        400: "Bad Request",
        404: "Not Found",
        405: "Method Not Allowed",
        500: "Internal Server Error"
    }.get(status_code, "Unexpected Status")
    return (
        f"HTTP/1.1 {status_code} {reason}\r\n"
        f"Content-Type: {content_type}\r\n"
        f"Content-Length: {len(body)}\r\n"
        f"Connection: close\r\n"
        f"\r\n"
    ).encode() + body

def route(req_path):
    if req_path == "/":
        return "content/main.html"
    if req_path.endswith(".js"):
        return f"js/{req_path}"
    return req_path[1:]

def handle_request(request_data):
    try:
        lines = request_data.decode().split("\r\n")
        if not lines:
            return build_response(400, b"Malformed request")

        method, raw_path, *_ = lines[0].split()
        if method != "GET":
            return build_response(405, b"Method Not Allowed")

        req_path = urlparse(unquote(raw_path)).path

        norm_path = os.path.normpath(req_path)

        if ".." in norm_path:
            return build_response(400, b"Fuck You")

        file_path = route(norm_path)

        if not file_path:
            return build_response(404, b"Not Found")

        full_path = BASE_DIR / file_path
        if not full_path.exists():
            return build_response(404, b"File not found")

        with open(full_path, "rb") as f:
            body = f.read()
            return build_response(200, body, guess_mime_type(file_path))

    except Exception as e:
        return build_response(500, f"Server error: {e}".encode())

def run():
    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(certfile=SSL_CERT, keyfile=SSL_KEY)

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((HOST, PORT))
        server.listen()
        print(f"Serving HTTPS on {HOST}:{PORT}")
        with ssl_ctx.wrap_socket(server, server_side=True) as ssock:
            while True:
                conn, addr = ssock.accept()
                with conn:
                    request = conn.recv(4096)
                    response = handle_request(request)
                    conn.sendall(response)
                    print("served!")

def init():
    schedule(run, None)

