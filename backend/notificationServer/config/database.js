const mongoose = require("mongoose");

const connectDatabase = () => {
  mongoose
    .connect(process.env.mongoDBURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then((data) => {
      console.log(`Mongodb connected with server: ${data.connection.host}`);
    })
    .catch((err) => {
      console.log(`Mongodb connection with server failed: ${err}`);
    });
};

module.exports = connectDatabase;
