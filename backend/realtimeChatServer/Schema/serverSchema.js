const mongoose = require("mongoose");

const serverSchema = new mongoose.Schema({
  serverName: { type: String, required: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  creationDate: { type: Date, default: Date.now },
  description: { type: String },
  defaultChannel: { type: mongoose.Schema.Types.ObjectId, ref: "Channel" },

  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  Serverpic: { type: String },
  inviteLink: { type: String },
});

const Server = mongoose.model("Server", serverSchema);
module.exports = Server;
