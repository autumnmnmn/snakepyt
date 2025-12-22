import socket
import ssl
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

#from lib import log

MODE = "local"

if MODE == "local":
    HOST = "0.0.0.0"
    PORT, SSL_PORT = 1313, None
    BASE_DIR = Path("./webui").resolve()
    USE_SSL = False
    SSL_CERT = "/home/ponder/ponder/certs/cert.pem"
    SSL_KEY = "/home/ponder/ponder/certs/key.pem"
elif MODE == "remote":
    HOST = "ponder.ooo"
    PORT, SSL_PORT = 80, 443
    BASE_DIR = Path("./webui").resolve()
    USE_SSL = True
    SSL_KEY="/etc/letsencrypt/live/ponder.ooo/privkey.pem"
    SSL_CERT="/etc/letsencrypt/live/ponder.ooo/fullchain.pem"

ROUTES = {
    "/": "content/main.html",
}

MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".wgsl": "text/wgsl",
    ".png": "image/png",
    ".orb": "text/x-orb"
}


def guess_mime_type(path):
    return MIME_TYPES.get(Path(path).suffix, "application/octet-stream")

def build_response(status_code, body=b"", content_type="text/plain"):
    reason = {
        200: "OK",
        301: "Moved Permanently",
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

def route(path):
    path = path.relative_to('/') if path.is_absolute() else path

    if path == Path():
        return BASE_DIR / "content/main.html"

    suffix = path.suffix

    if suffix in [".html", ".png"]:
        return BASE_DIR / Path("content") / path
    if suffix in [".wgsl"]:
        return BASE_DIR / Path("content/wgsl") / path
    if suffix in [".orb"]:
        return BASE_DIR / Path("content/orb") / path
    if suffix in [".js"]:
        return BASE_DIR / Path("js") / path
    return BASE_DIR / path

def handle_request(request_data):
    try:
        lines = request_data.decode().split("\r\n")
        if not lines:
            return build_response(400, b"Malformed request")

        method, raw_path, *_ = lines[0].split()
        if method != "GET":
            return build_response(405, b"Method Not Allowed")

        req_path = Path(urlparse(unquote(raw_path)).path).resolve(strict=False)

        routed_path = route(req_path).resolve(strict=False)

        if not routed_path.is_relative_to(BASE_DIR):
            return build_response(400, b"Fuck You")

        if not routed_path.exists():
            return build_response(404, b"File not found")

        with open(routed_path, "rb") as f:
            body = f.read()
            return build_response(200, body, guess_mime_type(routed_path))

    except Exception as e:
        return build_response(500, f"Server error: {e}".encode())



def build_redirect_response(location):
    return (
        f"HTTP/1.1 301 Moved Permanently\r\n"
        f"Location: {location}\r\n"
        f"Content-Length: 0\r\n"
        f"Connection: close\r\n"
        f"\r\n"
    ).encode()

def handle_http_redirect(conn):
    request = conn.recv(4096)
    try:
        lines = request.decode().split("\r\n")
        if lines:
            method, raw_path, *_ = lines[0].split()
            path = urlparse(unquote(raw_path)).path
        else:
            path = "/"
    except:
        path = "/"
    redirect = build_redirect_response(f"https://{HOST}{path}")
    conn.sendall(redirect)

def http_redirect_server():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((HOST, PORT))
        server.listen()
        print(f"redirecting on {HOST}:{PORT}")
        while True:
            try:
                conn, addr = server.accept()
            except KeyboardInterrupt:
                break
            except:
                continue
            with conn:
                try:
                    handle_http_redirect(conn)
                except:
                    pass


def ssl_main():
    ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_ctx.load_cert_chain(certfile=SSL_CERT, keyfile=SSL_KEY)

    #threading.Thread(target=http_redirect_server, daemon=True).start()

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((HOST, SSL_PORT))
        server.listen()
        print(f"Serving HTTPS on {HOST}:{SSL_PORT}")
        while True:
            try:
                conn, addr = server.accept()
                conn.settimeout(10.0)
                with ssl_ctx.wrap_socket(conn, server_side=True) as ssl_conn:
                    request = ssl_conn.recv(4096)
                    response = handle_request(request)
                    ssl_conn.sendall(response)
            except KeyboardInterrupt:
                raise
            except TimeoutError:
                continue
            except Exception as e:
                print(f"Error: {e}")
                exit()


def main():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((HOST, PORT))
        server.listen()
        print(f"Serving HTTP on {HOST}:{PORT}")
        while True:
            try:
                conn, addr = server.accept()
                request = conn.recv(4096)
                response = handle_request(request)
                conn.sendall(response)
            except KeyboardInterrupt:
                raise
            except Exception as e:
                print(e)
                break

if __name__ == "__main__":
    if USE_SSL:
        ssl_main()
    else:
        main()
