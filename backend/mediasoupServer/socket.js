const simpleSocket = require("./simpleSocket");

module.exports = async function (io, redisClient) {
  await simpleSocket(io, redisClient);
}; 