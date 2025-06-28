const mediasoup = require('mediasoup-client');
const { createWorker, createWebRtcTransport } = require('./Basicfunctions');
const { io } = require("socket.io-client");
const { createReadStream } = require('fs');
const ffmpeg = require('fluent-ffmpeg');

class DummyUser {
    constructor(username, roomName, videoFile) {
        this.username = username;
        this.roomName = roomName;
        this.videoFile = videoFile;
        this.socket = null;
        this.device = null;
        this.producerTransport = null;
        this.videoProducer = null;
        this.audioProducer = null;
    }

    async connect() {
        // Connect to the mediasoup server
        this.socket = io("https://localhost:3001", {
            secure: true,
            rejectUnauthorized: false,
            transports: ['websocket'],
            ca: null  // Ignore certificate validation for development
        });

        this.socket.on('connect', () => {
            console.log(`Dummy user ${this.username} connected with socket ID: ${this.socket.id}`);
        });

        // Join the room
        await new Promise((resolve) => {
            this.socket.emit('joinRoom', { roomName: this.roomName }, async ({ Routers, Currentindex }) => {
                // Create device and load it with router RTP capabilities
                this.device = new mediasoup.Device();
                await this.device.load({ routerRtpCapabilities: Routers[Currentindex] });
                resolve();
            });
        });

        // Create WebRTC transport
        await this.createTransport();
        
        // Start streaming video
        await this.startStreaming();
    }

    async createTransport() {
        return new Promise((resolve) => {
            this.socket.emit('createWebRtcTransport', { consumer: false }, async ({ params }) => {
                // Create send transport
                this.producerTransport = this.device.createSendTransport(params);

                this.producerTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
                    this.socket.emit('transport-connect', {
                        dtlsParameters,
                    });
                    callback();
                });

                this.producerTransport.on('produce', async (parameters, callback, errback) => {
                    this.socket.emit('transport-produce', {
                        kind: parameters.kind,
                        rtpParameters: parameters.rtpParameters,
                        appData: parameters.appData,
                    }, ({ id }) => {
                        callback({ id });
                    });
                });

                resolve();
            });
        });
    }

    async startStreaming() {
        // Create a video stream from the file using ffmpeg
        const stream = ffmpeg(this.videoFile)
            .format('webm')
            .videoCodec('libvpx')
            .audioCodec('libopus')
            .toFormat('webm')
            .on('end', () => {
                console.log('Streaming ended');
            })
            .on('error', (err) => {
                console.error('Streaming error:', err);
            });

        // Create MediaStream from the ffmpeg output
        const mediaStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: 640,
                height: 480,
                frameRate: 30
            },
            audio: true
        });

        // Create producers for video and audio
        const videoTrack = mediaStream.getVideoTracks()[0];
        const audioTrack = mediaStream.getAudioTracks()[0];

        this.videoProducer = await this.producerTransport.produce({
            track: videoTrack,
            encodings: [
                { maxBitrate: 100000, scalabilityMode: 'S1T3' },
                { maxBitrate: 300000, scalabilityMode: 'S1T3' },
                { maxBitrate: 900000, scalabilityMode: 'S1T3' }
            ],
            codecOptions: {
                videoGoogleStartBitrate: 1000
            }
        });

        this.audioProducer = await this.producerTransport.produce({
            track: audioTrack
        });
    }

    disconnect() {
        if (this.videoProducer) this.videoProducer.close();
        if (this.audioProducer) this.audioProducer.close();
        if (this.producerTransport) this.producerTransport.close();
        if (this.socket) this.socket.disconnect();
    }
}

// Function to create multiple dummy users
async function createDummyUsers(count, roomName, videoFile) {
    const users = [];
    for (let i = 0; i < count; i++) {
        const user = new DummyUser(`DummyUser${i + 1}`, roomName, videoFile);
        await user.connect();
        users.push(user);
        // Add some delay between user connections to prevent overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return users;
}

module.exports = {
    DummyUser,
    createDummyUsers
}; 