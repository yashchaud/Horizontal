const app = require("./app");
const connectDatabase = require("./config/database");
const configureSocket = require("./socket");
const os = require("os");
var { Server } = require("socket.io");

const networkInterfaces = os.networkInterfaces();

//Config
if (process.env.NODE_ENV !== "PRODUCTION") {
  require("dotenv").config({ path: "./.env" });
}

//For network ip address
const ip = Object.values(networkInterfaces)
  .flat()
  .find((iface) => iface.family === "IPv4" && !iface.internal)?.address;

//Connecting to database
connectDatabase();

const PORT = process.env.PORT || 3003;

//Initialize server
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://${ip}:${PORT}`);
});

const io = new Server(server, {
  cors: { origin: "https://localhost:3001", credentials: true },
  cookie: true,
});

//Initialize socket on server
configureSocket(io);
