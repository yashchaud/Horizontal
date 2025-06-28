var mongoose = require("mongoose");
var app = require("./app");
var debug = require("debug")("backend:server");
 var http = require("http");
var fs = require("fs");
var { Server } = require("socket.io");
var Socketsetup = require("./Socket");
const cors = require("cors");
require("dotenv").config();

// MongoDB Connection
const mongoDBURI =
  "mongodb+srv://yashc:yash123456@cluster0.xqys6ob.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(mongoDBURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

var db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", function () {
  console.log("Connected to MongoDB");
});

// Define Port
const ports = 3000;
var port = normalizePort(ports || "3000");

// const privateKey = fs.readFileSync(process.env.PRIVATEKEY);
// const certificate = fs.readFileSync(process.env.CERTIFICATE);

// Load SSL Certificate and Key
// const options = { key: privateKey, cert: certificate };

// Create HTTPS Server
var server = http.createServer( app);
// var server = http.createServer(app);

// Listen on Port
server.listen(port, () => {
  console.log(`Server is working on https://localhost:${port}`);
});

server.on("error", onError);
server.on("listening", onListening);

// Setup Socket.io
const io = new Server(server, {
  cors: {
    // origin: "https://www.yashportfoliohub.site",
    origin: [
      "https://localhost:3001",
      "https://localhost:3000",
      "http://localhost:3000",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    credentials: true,
  },
  cookie: true,
});

Socketsetup(io);

// Normalize Port Function
function normalizePort(val) {
  var port = parseInt(val, 10);
  if (isNaN(port)) {
    return val;
  }
  if (port >= 0) {
    return port;
  }
  return false;
}

// Error Handling
function onError(error) {
  if (error.syscall !== "listen") {
    throw error;
  }

  var bind = typeof port === "string" ? "Pipe " + port : "Port " + port;

  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
    default:
      throw error;
  }
}

// Listening Event
function onListening() {
  var addr = server.address();
  var bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
  debug("Listening on " + bind);
}
