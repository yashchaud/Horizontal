const Notification = require("../schemas/Notification.js");
const UserSchema = require("../schemas/userSchema.js");
const { io } = require("../app.js");
console.log(io);

const notificationController = {
  createNotification: async (req, res) => {
    const { reciever, message, from, Username } = req.body;
    try {
      console.log("reciever", reciever, "message", message);
      const user = await UserSchema.findOne({ _id: reciever });
      const notification = await Notification.create({
        userId: user._id,
        message,
        from,
        Username,
      });
      console.log("notification", notification);
      io.to(user.notificationId).emit("new_notification", message);

      res.status(201).json(notification);
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error creating notification" });
    }
  },
  getNotifications: async (req, res) => {
    try {
      const notifications = await Notification.find();
      res.status(200).json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Error getting notifications" });
    }
  },
  getNotificationById: async (req, res) => {
    const { id } = req.params;
    try {
      const notification = await Notification.findById(id);
      res.status(200).json(notification);
    } catch (error) {
      res.status(500).json({ message: "Error getting notification" });
    }
  },
  updateNotification: async (req, res) => {
    const { id } = req.params;
    const { read } = req.body;
    try {
      const notification = await Notification.findByIdAndUpdate(id, { read });
      res.status(200).json(notification);
    } catch (error) {
      res.status(500).json({ message: "Error updating notification" });
    }
  },
};

module.exports = notificationController;
