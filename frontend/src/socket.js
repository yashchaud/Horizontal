// socket.js
import io from "socket.io-client";

let socket;
let notificationSocket;

export const connectSocket = () => {
  if (!socket) {
    socket = io("http://localhost:3000", {
      withCredentials: true,
      secure: true,
    });
    console.log("Connecting socket...");
  }
};

export const getSocket = () => {
  if (!socket) {
    console.log("Socket not connected");
    connectSocket();
  }
  return socket;
};

// export const connectSocketNotification = () => {
//   if (!notificationSocket) {
//     notificationSocket = io("http://localhost:3003", {
//       withCredentials: true,
//       secure: true,
//     });
//     console.log("Connecting socket...");
//   }
// };

// export const getNotificationSocket = () => {
//   if (!notificationSocket) {
//     console.log("Notification socket not connected");
//     connectSocketNotification();
//   }
//   return notificationSocket;
// };
