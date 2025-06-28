const axios = require("axios"); // To make HTTP requests to the API server
const { Server } = require("socket.io");
const fs = require("fs");
const https = require("https");
const express = require("express");

const privateKey = fs.readFileSync("/home/ajinkya/ssl/localhost+2-key.pem");
const certificate = fs.readFileSync("/home/ajinkya/ssl/localhost+2.pem");

const credentials = { key: privateKey, cert: certificate };

const app = express();
const server = https.createServer(credentials, app);

const agent = new https.Agent({
  rejectUnauthorized: false, // Disable certificate validation
});

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

server.listen(4000, () => {
  console.log("Broker server running on https://localhost:4000");
});

io.on("connection", (socket) => {
  console.log("New client connected: " + socket.id);

  socket.on("joinRoom", async (roomName) => {
    try {
      // Use HTTP API to create the room by calling the API server's /api/room endpoint
      const response = await axios.post(
        "https://localhost:3001/api/room",
        {
          roomName,
          socketId: socket.id, // Pass socket ID so that the room can be associated with the user
        },
        { httpsAgent: agent }
      );

      // Handle successful room creation
      socket.emit("roomCreated", response.data.message);
    } catch (error) {
      console.error("Error creating room:", error);
      socket.emit("error", "Failed to create room");
    }
  });

  socket.on("getRoomDetails", async (roomName) => {
    try {
      // Fetch room details via the API server's /api/room/:roomName endpoint
      const response = await axios.get(
        `https://localhost:3001/api/room/${roomName}`,
        { httpsAgent: agent }
      );
      socket.emit("roomDetails", response.data);
    } catch (error) {
      console.error("Error getting room details:", error);
      socket.emit("error", "Failed to get room details");
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected: " + socket.id);
  });
});

// Metrics endpoint for Prometheus
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", promClient.register.contentType);
  res.end(await promClient.register.metrics());
});
