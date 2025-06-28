const createRoom = async (roomName, socketId, i, roomQueue, rooms, workermap) => {
    return roomQueue.push(async () => {
      let room = rooms.get(roomName);

      let peers = [];
      if (!room) {
        const router = await workermap.get(i).router;
        room = { router, peers: new Set([socketId]) };
        rooms.set(roomName, room);
      } else {
        room.peers.add(socketId);
      }

      console.log(`This is Room Router ${room.router} ${rooms}`);

      return room.router;
    });
  };

  const getTransport = (socketId, transports) => {
    for (let [transportId, transportData] of transports.entries()) {
      if (transportData.socketId === socketId && !transportData.consumer) {
        return transportData.transport;
      }
    }
    console.error(`Transport not found for socket ID: ${socketId}`);
    return null;
  };

  const addConsumer = (consumer, roomName, socketId, consumers, peers) => {
    if (!Array.isArray(consumers)) {
      console.error('consumers must be an array');
      return consumers;
    }

    if (!peers || !(peers instanceof Map)) {
      console.error('peers must be a Map');
      return consumers;
    }

    // Check if consumer already exists
    if (consumers.some((c) => c.consumer.id === consumer.id)) {
      console.warn(`Consumer ${consumer.id} already exists.`);
      return consumers;
    }

    // Create new consumers array with the new consumer
    const updatedConsumers = [...consumers, { socketId: socketId, consumer, roomName }];

    // Update peer's consumers
    const peer = peers.get(socketId);
    if (peer) {
      if (!peer.consumers) peer.consumers = [];
      peer.consumers.push(consumer.id);
      peers.set(socketId, peer);
    } else {
      console.warn(`Peer ${socketId} not found when adding consumer`);
    }

    return updatedConsumers;
  };


  const addTransport = async (transport, roomName, consumer, transports, peers, socketId) => {
    transports.set(transport.id, {
      socketId: socketId,
      transport,
      roomName,
      consumer,
    });

    let peer = peers.get(socketId);

    await peer?.transports?.push(transport.id);
    peers.set(socketId, peer);
  };


  const addProducer = async (producer, roomName, kind, producers, peers, socketId ) => {
    if (producers.some((p) => p.producer.id === producer.id)) {
      console.warn(`Producer ${producer.id} already exists.`);
      return;
    }

    producers = [ 
      ...producers,
      { socketId: socketId, producer, roomName, kind },
    ];
    console.log(producer.id);

    let peer = peers.get(socketId);
    peer.producers.push(producer.id);
    peers.set(socketId, peer);
    return producers;
  };


   

  const informConsumers = (roomName, socketId, id, socket, producers, peers, pipeProducer, workermap) => {
    console.log(`just joined, id ${id} ${roomName}, ${socketId}`);

    producers.forEach((producerData) => {
      if (
        producerData.socketId !== socketId &&
        producerData.roomName === roomName
      ) { 
        if (peers.has(producerData.socketId)) {
          const producerSocket = peers.get(producerData.socketId).socket;
          console.log("Inform", producerData.producer.id, id);
          socket.broadcast.to(roomName).emit("new-producer", {
            producerId: id,
            targetRouterindex: 0,
          });

          pipeProducer(id, producerSocket, socket);
        } else {
          console.log(`Producer not found in peers: ${producerData.socketId}`);
        }
      }
    });
  };

  module.exports = { createRoom, getTransport, addConsumer, addTransport, addProducer, informConsumers };
