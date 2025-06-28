# MediaSoup Streaming Server

A modern video streaming server implementation using MediaSoup, with separated producer (streamer) and consumer (viewer) servers.

## Features

- Separate producer and consumer servers for better scalability
- High-quality video streaming with VP8 codec support
- Configurable video quality with multiple encoding layers
- Real-time stream status updates
- Automatic stream cleanup on disconnection
- Error handling and logging
- WebRTC transport management

## Architecture

The system is split into two main components:

1. **Producer Server (`ProducerServer.js`)**
   - Handles video/audio producers (streamers)
   - Manages WebRTC transports for producers
   - Broadcasts stream availability to consumer servers
   - Handles stream pause/resume/end events

2. **Consumer Server (`ConsumerServer.js`)**
   - Handles viewers/consumers
   - Manages WebRTC transports for consumers
   - Maintains list of available streams
   - Handles viewer connections and disconnections

## Prerequisites

- Node.js >= 14
- npm or yarn
- MediaSoup compatible environment

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with the following variables:
```env
PORT=3000
ANNOUNCED_IP=your_public_ip
NODE_ENV=production
```

## Usage

### Starting the Server

```bash
node index.js
```

This will start both producer and consumer servers on different Socket.IO paths:
- Producer server: `/producer`
- Consumer server: `/consumer`

### Producer (Streamer) Connection

1. Connect to the producer WebSocket endpoint:
```javascript
const socket = io('http://your-server:3000', { path: '/producer' });
```

2. Set up a stream:
```javascript
socket.emit('setupStream', { streamId: 'unique-stream-id' }, callback);
```

3. Connect transport and start producing:
```javascript
socket.emit('transport-connect', { dtlsParameters });
socket.emit('transport-produce', {
  kind: 'video',
  rtpParameters,
  streamId,
  appData
});
```

### Consumer (Viewer) Connection

1. Connect to the consumer WebSocket endpoint:
```javascript
const socket = io('http://your-server:3000', { path: '/consumer' });
```

2. Set up consumer for a stream:
```javascript
socket.emit('setupConsumer', { streamId }, callback);
```

3. Connect transport and start consuming:
```javascript
socket.emit('transport-connect', { dtlsParameters });
socket.emit('consume', {
  streamId,
  rtpCapabilities
});
```

## Events

### Producer Events
- `connection-success`: Connection established
- `new-stream-available`: New stream is available
- `stream-ended`: Stream has ended
- `stream-paused`: Stream is paused
- `stream-resumed`: Stream is resumed

### Consumer Events
- `connection-success`: Connection established with available streams
- `stream-available`: New stream is available to consume
- `stream-ended`: Stream has ended
- `stream-paused`: Stream is paused
- `stream-resumed`: Stream is resumed

## Error Handling

Both servers implement comprehensive error handling:
- Transport connection errors
- Stream setup errors
- Consumer/Producer creation errors
- Disconnection cleanup

## Performance Considerations

- Video encodings are configured for different quality levels
- WebRTC transport parameters are optimized for streaming
- Automatic cleanup of resources on disconnection
- Separate servers allow for better load distribution

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

MIT 