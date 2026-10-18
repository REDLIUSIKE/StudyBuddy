"""Deny worker egress while allowing the standard library's own internal socketpair."""
from contextvars import ContextVar
import socket

_original_pair = socket.socketpair
_original_connect = socket.socket.connect
_pair_scope = ContextVar("skill_scanner_internal_socketpair", default=False)
_installed = False


def network_denied(*args, **kwargs):
    raise RuntimeError("SKILL_SAFETY_WORKER_NETWORK_DENIED")


def _connect_pair(sock, address):
    if (
        _pair_scope.get()
        and sock.family in (socket.AF_INET, socket.AF_INET6)
        and sock.type == socket.SOCK_STREAM
        and isinstance(address, tuple)
        and len(address) >= 2
        and address[0] in ("127.0.0.1", "::1")
        and type(address[1]) is int
        and 0 < address[1] < 65536
    ):
        return _original_connect(sock, address)
    return network_denied()


def _socketpair(*args, **kwargs):
    token = _pair_scope.set(True)
    try:
        return _original_pair(*args, **kwargs)
    finally:
        _pair_scope.reset(token)


def install_network_policy():
    """Install once before loading scanner dependencies; never grant general loopback access."""
    global _installed
    if _installed:
        return
    socket.socket.connect = _connect_pair
    socket.socket.connect_ex = network_denied
    socket.socket.sendto = network_denied
    if hasattr(socket.socket, "sendmsg"):
        socket.socket.sendmsg = network_denied
    for name in ("getaddrinfo", "gethostbyname", "gethostbyname_ex", "gethostbyaddr", "getnameinfo"):
        setattr(socket, name, network_denied)
    socket.socketpair = _socketpair
    _installed = True
