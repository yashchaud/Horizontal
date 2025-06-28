const express = require("express");
const app = express();
const cookieParser = require("cookie-parser");
var logger = require("morgan");
var path = require("path");
const cors = require("cors");

// Enable CORS for all routes
const corsOptions = {
  origin: "https://localhost:3001", // Specify the origin of your frontend application
  credentials: true, // This allows cookies and credentials to be included in the requests
};
app.use(cors(corsOptions));
// Static Middleware
const public = path.resolve(__dirname, "public");
app.use(express.static(public));

// View Engine Setup
app.set("views", path.join(__dirname, "views"));

// view engine setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Config
if (process.env.NODE_ENV !== "PRODUCTION") {
  require("dotenv").config({ path: "./.env" });
}

const notificationRoute = require("./routes/notificationRoute");
app.use("/api/notification", notificationRoute);

app.use("/public", express.static(path.join(__dirname, "public")));

module.exports = app;
