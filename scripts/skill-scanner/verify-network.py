"""Exercise the shipped worker policy with owned loopback sockets, without external traffic."""
import asyncio
from pathlib import Path
import socket
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import worker  # Installs the same policy as actual scanner execution.


class WorkerNetworkTests(unittest.TestCase):
    def test_framework_socketpair_can_exchange_internal_bytes(self):
        try:
            left, right = socket.socketpair()
        except RuntimeError as error:
            self.fail("Internal socketpair was denied: " + str(error))
        try:
            left.settimeout(1)
            right.settimeout(1)
            left.sendall(b"internal-pair")
            self.assertEqual(right.recv(32), b"internal-pair")
        finally:
            left.close()
            right.close()

    def test_windows_asyncio_can_create_and_close_its_internal_pair(self):
        async def step():
            await asyncio.sleep(0)
            return "local-only"

        coroutine = step()
        try:
            self.assertEqual(asyncio.run(coroutine), "local-only")
        except RuntimeError as error:
            self.fail("Windows internal asyncio pipe was denied: " + str(error))
        finally:
            coroutine.close()

    def test_direct_loopback_connect_is_not_granted_pair_permission(self):
        with socket.socket() as listener, socket.socket() as client:
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            with self.assertRaisesRegex(RuntimeError, "SKILL_SAFETY_WORKER_NETWORK_DENIED"):
                client.connect(listener.getsockname())

    def test_direct_connect_ex_is_denied(self):
        with socket.socket() as listener, socket.socket() as client:
            listener.bind(("127.0.0.1", 0))
            listener.listen(1)
            with self.assertRaisesRegex(RuntimeError, "SKILL_SAFETY_WORKER_NETWORK_DENIED"):
                client.connect_ex(listener.getsockname())

    def test_dns_api_is_denied_without_issuing_a_dns_request(self):
        with self.assertRaisesRegex(RuntimeError, "SKILL_SAFETY_WORKER_NETWORK_DENIED"):
            socket.getaddrinfo("127.0.0.1", 1, flags=socket.AI_NUMERICHOST)

    def test_other_numeric_only_name_lookups_are_denied(self):
        for resolve in (socket.gethostbyname, socket.gethostbyname_ex):
            with self.subTest(resolve=resolve.__name__):
                with self.assertRaisesRegex(RuntimeError, "SKILL_SAFETY_WORKER_NETWORK_DENIED"):
                    resolve("127.0.0.1")
        with self.assertRaisesRegex(RuntimeError, "SKILL_SAFETY_WORKER_NETWORK_DENIED"):
            socket.getnameinfo(("127.0.0.1", 1), socket.NI_NUMERICHOST | socket.NI_NUMERICSERV)

    def test_datagram_sendto_is_denied(self):
        with socket.socket(type=socket.SOCK_DGRAM) as receiver, socket.socket(type=socket.SOCK_DGRAM) as sender:
            receiver.bind(("127.0.0.1", 0))
            with self.assertRaisesRegex(RuntimeError, "SKILL_SAFETY_WORKER_NETWORK_DENIED"):
                sender.sendto(b"owned-local-fixture", receiver.getsockname())

    def test_pair_permission_does_not_survive_a_failed_construction(self):
        with self.assertRaises(ValueError):
            socket.socketpair(socket.AF_INET, socket.SOCK_DGRAM)
        self.test_direct_loopback_connect_is_not_granted_pair_permission()


if __name__ == "__main__":
    unittest.main(verbosity=2)
