#!/bin/bash
set -e

PATH=/usr/local/bin:$PATH

if [ -z "$PUBLIC_IP" ]; then
  LOCAL_IP=$(ip addr show tunl0 | awk '/inet / {print $2}' | cut -f1 -d'/')
  PUBLIC_IP=$(ip addr show eth0 | awk '/inet / {print $2}' | cut -f1 -d'/')
  PRIVATE_INTERFACE="private/${LOCAL_IP}"
  PUBLIC_INTERFACE="public/${PUBLIC_IP}"
fi

if [ -z "$RTP_START_PORT" ]; then
  RTP_START_PORT=40000
fi
if [ -z "$RTP_END_PORT" ]; then
  RTP_END_PORT=60000
fi
if [ -z "$LOGLEVEL" ]; then
  LOGLEVEL=5
fi

echo "LOGLEVEL is $LOGLEVEL"

if [ "$1" = 'rtpengine' ]; then
  shift
  exec rtpengine \
  --interface ${PRIVATE_INTERFACE} --interface ${PUBLIC_INTERFACE} \
  --port-min ${RTP_START_PORT} --port-max ${RTP_END_PORT} \
  --log-level ${LOGLEVEL} --port-min ${RTP_START_PORT} --port-max ${RTP_END_PORT} \
  --listen-ng=22222 --listen-http=8080 --listen-udp=12222 \
  --dtmf-log-dest=127.0.0.1:22223 \
  --listen-cli=127.0.0.1:9900 \
  --pidfile /var/run/rtpengine.pid \
  --recording-dir /tmp --recording-method pcap --recording-format eth \
  --delete-delay 0 \
  --log-stderr \
  --foreground \
  $@
else 
  exec "$@"
fi
