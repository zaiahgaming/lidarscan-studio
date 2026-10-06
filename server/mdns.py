import socket
import logging
from zeroconf import Zeroconf, ServiceInfo
from .net_utils import get_lan_ip

logger = logging.getLogger("lidarscan.mdns")

class LidarScanAdvertiser:
    def __init__(self, port: int = 8765):
        self.port = port
        self.zeroconf: Zeroconf | None = None
        self.service_info: ServiceInfo | None = None

    def start(self):
        try:
            ip = get_lan_ip()
            ip_bytes = socket.inet_aton(ip)
            service_type = "_lidarscan._tcp.local."
            instance_name = f"LidarScan Studio.{service_type}"

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
                server="lidarscan-studio.local.",
            )

            self.zeroconf = Zeroconf()
            self.zeroconf.register_service(self.service_info)
            logger.info(f"mDNS service registered: {instance_name} at {ip}:{self.port}")
        except Exception as e:
            logger.warning(f"Failed to start mDNS service: {e}")

    def stop(self):
        if self.zeroconf and self.service_info:
            try:
                self.zeroconf.unregister_service(self.service_info)
                self.zeroconf.close()
                logger.info("mDNS service stopped")
            except Exception as e:
                logger.warning(f"Error stopping mDNS: {e}")
            finally:
                self.zeroconf = None
                self.service_info = None
