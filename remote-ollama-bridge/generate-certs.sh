#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
IP="${1:-}"
if [[ ! "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Usage: ./generate-certs.sh FRIEND_MAC_PRIVATE_IPV4 (example: 192.168.1.42)" >&2
  exit 2
fi
python3 - "$IP" <<'PY'
import ipaddress, sys
ip = ipaddress.ip_address(sys.argv[1])
if not ip.is_private or ip.is_loopback or ip.is_link_local:
    raise SystemExit('Use the friend Mac private Wi-Fi IPv4 address, not localhost or a public IP.')
PY
mkdir -p certs
chmod 700 certs
if [[ -e certs/ca.key || -e certs/ca.crt || -e certs/server.key || -e certs/server.crt ]]; then
  echo "Certificates already exist. Move/delete remote-ollama-bridge/certs first if you intentionally need to regenerate." >&2
  exit 3
fi
cat > certs/ca.cnf <<'CFG'
[req]
prompt = no
distinguished_name = dn
x509_extensions = v3_ca
[dn]
CN = FocusTube Local Ollama Bridge CA
O = FocusTube Local LAN
[v3_ca]
subjectKeyIdentifier = hash
authorityKeyIdentifier = keyid:always,issuer
basicConstraints = critical, CA:true
keyUsage = critical, keyCertSign, cRLSign
CFG
cat > certs/server.cnf <<CFG
[req]
prompt = no
distinguished_name = dn
req_extensions = v3_req
[dn]
CN = $IP
O = FocusTube Local LAN
[v3_req]
subjectAltName = @alt_names
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
[alt_names]
IP.1 = $IP
CFG
openssl genrsa -out certs/ca.key 3072 >/dev/null 2>&1
openssl req -x509 -new -sha256 -days 825 -key certs/ca.key -out certs/ca.crt -config certs/ca.cnf >/dev/null 2>&1
openssl genrsa -out certs/server.key 2048 >/dev/null 2>&1
openssl req -new -key certs/server.key -out certs/server.csr -config certs/server.cnf >/dev/null 2>&1
openssl x509 -req -in certs/server.csr -CA certs/ca.crt -CAkey certs/ca.key -CAcreateserial -out certs/server.crt -days 365 -sha256 -extfile certs/server.cnf -extensions v3_req >/dev/null 2>&1
rm -f certs/server.csr certs/ca.srl
chmod 600 certs/ca.key certs/server.key
chmod 644 certs/ca.crt certs/server.crt
cat > certs/README.txt <<TXT
Certificate files generated for the FocusTube Ollama bridge.
Keep ca.key and server.key private. Only copy ca.crt to the client Mac and trust it there.
Server certificate IP SAN: $IP
If the Mac's Wi-Fi IPv4 changes, regenerate the certificates for the new IP and re-trust the CA on the client Mac.
TXT
echo "TLS certificate created for https://$IP:11435"
echo "On your friend's Mac, keep certs/ca.key and certs/server.key private. Copy ONLY certs/ca.crt to your Mac."
