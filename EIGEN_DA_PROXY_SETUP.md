# Start the proxy with memstore backend enabled
$ docker run --rm -p 3100:3100 ghcr.io/layr-labs/eigenda-proxy:latest --memstore.enabled --port 3100

# or when on arm processors
docker run --rm \
  --platform linux/amd64 \
  -p 3100:3100 \
  ghcr.io/layr-labs/eigenda-proxy:latest \
  --memstore.enabled \
  --port 3100

# In another terminal... submit a payload save the returned cert in hex format
$ CERT_HEX=$(curl -X POST -d my-eigenda-payload "http://127.0.0.1:3100/put?commitment_mode=standard" | xxd -p | tr -d ' \n')

# Finally retrieve the payload using the cert
$ curl "http://127.0.0.1:3100/get/$CERT_HEX?commitment_mode=standard"