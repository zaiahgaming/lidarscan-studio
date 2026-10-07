import socket
import logging
import threading

from zeroconf import Zeroconf, ServiceInfo

from .net_utils import get_lan_ip

logger = logging.getLogger("lidarscan.mdns")


class LidarScanAdvertiser:
    def __init__(self, port: int = 8765):
        self.port = port
        self.zeroconf: Zeroconf | None = None
        self.service_info: ServiceInfo | None = None

    def start(self):
        # zeroconf's sync register_service blocks and raises EventLoopBlocked
        # when invoked from inside an asyncio event loop (uvicorn lifespan).
        # Run it on a worker thread so startup never blocks or fails.
        threading.Thread(target=self._register, name="lidarscan-mdns", daemon=True).start()

    def _register(self):
        try:
            ip = get_lan_ip()
            ip_bytes = socket.inet_aton(ip)
            service_type = "_lidarscan._tcp.local."
            instance_name = f"LidarScan Studio.{service_type}"
            host_name = f"{socket.gethostname().lower() or 'lidarscan-studio'}.local."

            properties = {
                "name": "LidarScan Studio",
                "version": "1",
                "port": str(self.port),
            }

            self.service_info = ServiceInfo(
                type_=service_type,
                name=instance_name,
                addresses=[ip_bytes],
                port=self.port,
                properties=properties,
                server=host_name,
            )

            zeroconf = Zeroconf()
            self.zeroconf = zeroconf
            # Re-claiming a stale or duplicate name must self-heal by renaming
            # (e.g. "LidarScan Studio (2)") instead of failing registration.
            zeroconf.register_service(self.service_info, allow_name_change=True)
            logger.info(f"mDNS service registered: {instance_name} at {ip}:{self.port}")
        except Exception as e:
            logger.warning(f"Failed to start mDNS service: {e!r}")

    def stop(self):
        def _stop():
            zeroconf, info = self.zeroconf, self.service_info
            self.zeroconf = None
            self.service_info = None
            if zeroconf and info:
                try:
                    zeroconf.unregister_service(info)
                    zeroconf.close()
                    logger.info("mDNS service stopped")
                except Exception as e:
                    logger.warning(f"Error stopping mDNS: {e!r}")

        threading.Thread(target=_stop, name="lidarscan-mdns-stop", daemon=True).start()
