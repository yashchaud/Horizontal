const chatcontroller = require("./controller/chatController");
const Threadchatcontroller = require("./controller/Threadchatcontroller");
const Usercontroller = require("./controller/usercontroller");
const UserSchema = require("./Schema/userSchema.js");
const Server = require("./Schema/serverSchema");
const axios = require("axios");

var cookie = require("cookie");
const produceMessage = require("./utils/kafkaProducer.js");

module.exports = function (io) {
  io.on("connection", async (socket) => {
    const cookies = cookie.parse(socket.handshake.headers.cookie || "");
    const jwt = cookies.jwt;
    if (!jwt) return;

    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = JSON.parse(Buffer.from(base64, "base64").toString());

    const user = await UserSchema.findByIdAndUpdate(
      { _id: decodedPayload.userId },
      { $set: { connected: true } }
    );

    console.log("A user connected", socket.id, user);

    socket.on("join_channel", (channelId) => {
      console.log(channelId);
      socket.join(channelId);
      console.log(`User ${socket.id} joined channel ${channelId}`);
    });

    socket.on("send_message", async (data) => {
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const jwt = cookies.jwt;
      if (!jwt) throw new Error("JWT not found");

      const base64Url = jwt.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const decodedPayload = JSON.parse(
        Buffer.from(base64, "base64").toString()
      );

      if (!decodedPayload.userId) throw new Error("Invalid JWT payload");

      try {
        if (data.reciever) {
          const Directmessage = await Usercontroller.sendMessage(
            data,
            decodedPayload.userId
          );
          io.to(decodedPayload.userId).emit("New-directmessage", Directmessage);
          io.to(data.reciever).emit("New-directmessage", Directmessage);
          const user = await UserSchema.findById(decodedPayload.userId);

          // Produce message to Kafka
          await produceMessage("notification-topic", {
            message: data.content,
            reciever: data.reciever,
            from: decodedPayload.userId,
            Username: user.username,
          });
        }

        if (data.channel) {
          let = chat = await chatcontroller.sendMessage(
            data,
            decodedPayload.userId
          );
          console.log(data);
          const server = await Server.findById(data.server);

          // server.members.map(async (member) => {
          //   await produceMessage("message-topic", {
          //     message: data.content,
          //     from: decodedPayload.userId,
          //     reciever: member,
          //     server: data.server,
          //   });
          // });

          io.to(data.channel).emit("new_message", chat);

          return;
        }
        if (data.threadId) {
          const cookies = cookie.parse(socket.handshake.headers.cookie || "");
          const jwt = cookies.jwt;
          const decodedPayload = JSON.parse(atob(jwt.split(".")[1]));
          user = decodedPayload.userId;

          let chat = await Threadchatcontroller.sendMessage(
            data,
            decodedPayload.userId
          );
          io.to(data.threadId).emit("new_message", chat);

          return;
        }
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", error.message);
      }
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected");
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const jwt = cookies.jwt;
      if (!jwt) return;

      const base64Url = jwt.split(".")[1];
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const decodedPayload = JSON.parse(
        Buffer.from(base64, "base64").toString()
      );

      const user = await UserSchema.findByIdAndUpdate(
        { _id: decodedPayload.userId },
        { $set: { connected: false } }
      );
      console.log(user);
    });
  });
};
