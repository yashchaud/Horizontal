require("dotenv").config();
const express = require("express");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");
const cors = require("cors");
const initializeMediasoup = require("./simpleSocket");

const app = express();

// Enable CORS for all routes
app.use(cors({
  origin: process.env.CORS_ORIGIN,
  credentials: true
}));

 
 



// SSL configuration
const sslOptions = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH)
};

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Socket.IO configuration
const io = new socketIO.Server(httpsServer, {
  cors: {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  perMessageDeflate: false,
  httpCompression: false,
  path: "/socket.io/",
});

async function startServer() {
  // Initialize mediasoup with our socket.io instance
  await initializeMediasoup(io);

  // Start HTTPS server
  const port = process.env.PORT || 3001;
  httpsServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

