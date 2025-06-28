export SERVER_ID=server-2
export PORT=3002
export SSL_KEY_PATH="./backend/mediasoupServer/sslcert/key.pem"
export SSL_CERT_PATH="./backend/mediasoupServer/sslcert/cert.pem"

export PUBLIC_IP=127.0.0.1
export REMOTE_SERVER_ID=server-1
export REMOTE_SERVER_URL="https://127.0.0.1:3001"
export INTER_SERVER_SECRET="supersecret"
node backend/mediasoupServer/index.js