import socket
import psutil

def get_lan_ip() -> str:
    """Find the best local LAN IPv4 address."""
    # First try connecting a dummy socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Doesn't actually send data
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        if ip and not ip.startswith('127.'):
            return ip
    except Exception:
        pass

    # Fallback to interface scan
    preferred_prefixes = ('192.168.', '10.', '172.16.', '172.20.')
    for iface, addrs in psutil.net_if_addrs().items():
        if iface.startswith(('lo', 'docker', 'br-', 'veth')):
            continue
        for addr in addrs:
            if addr.family == socket.AF_INET and not addr.address.startswith('127.'):
                for pref in preferred_prefixes:
                    if addr.address.startswith(pref):
                        return addr.address
                return addr.address
    return '127.0.0.1'
