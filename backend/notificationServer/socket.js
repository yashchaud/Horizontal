const app = require("./app");
const Notification = require("./schemas/Notification.js");
const UserSchema = require("./schemas/userSchema.js");
const cookie = require("cookie");
const { Kafka } = require("kafkajs");

const kafka = new Kafka({
  clientId: "real-time-server",
  brokers: ["localhost:29092"],
});

const consumer = kafka.consumer({ groupId: "notification-group" });

module.exports = function (io) {
  io.on("connection", async (socket) => {
    console.log(socket.id);
    const cookies = cookie.parse(socket.handshake.headers.cookie || "");
    const jwt = cookies.jwt;
    if (!jwt) throw new Error("JWT not found");

    const base64Url = jwt.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const decodedPayload = JSON.parse(Buffer.from(base64, "base64").toString());
    const userId = decodedPayload.userId;
    console.log("UserID", userId);
    const User = await UserSchema.findByIdAndUpdate(userId, {
      $set: { notificationId: socket.id },
    });
  });

  const consumeMessages = async () => {
    await consumer.connect();
    await consumer.subscribe({
      topic: "notification-topic",
      fromBeginning: true,
    });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        console.log(message);
        const notificationData = JSON.parse(message.value.toString());

        const user = await UserSchema.findById(notificationData.reciever);
        if (!user) {
          console.error(`User not found: ${notificationData.reciever}`);
          return;
        }

        const notification = await Notification.create({
          userId: notificationData.reciever,
          reciever: notificationData.reciever,
          from: notificationData.from,
          message: notificationData.message,
        });

        console.log("notification", notification);
        io.to(user.notificationId).emit("new_notification", notificationData);
      },
    });
  };

  consumeMessages().catch(console.error);
};
