var express = require("express");
var router = express.Router();
const notificationController = require("../controllers/notificationController.js");
const { isAuthenticated } = require("../middlewares/auth.js");

router.get("/", notificationController.getNotifications);
router.get("/:id", notificationController.getNotificationById);
router.put("/:id", notificationController.updateNotification);

module.exports = router;
