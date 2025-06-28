const mediasoup = require("mediasoup");
const os = require("os");
require("dotenv").config();

const RTC_MIN_PORT = 2000;
const RTC_MAX_PORT = 10000;
const ANNOUNCED_IP = "127.0.0.1";
// const ANNOUNCED_IP = "65.1.55.237";

async function createWorker() {
  try {
    const numCores = os.cpus().length;

    const worker = await mediasoup.createWorker({
      logLevel: "debug",
      logTags: ["rtp", "srtp", "rtcp"],
      rtcMinPort: RTC_MIN_PORT,
      rtcMaxPort: RTC_MAX_PORT,
    });

    console.log(`worker pid ${worker.pid}`);

    worker.on("died", (error) => {
      console.error("mediasoup worker has died", error);
      setTimeout(() => process.exit(1), 2000);
    });

    return worker;
  } catch (error) {
    console.error("Error creating worker:", error);
    throw error;
  }
}

async function createWebRtcTransport(router) {
  const webRtcTransportOptions = {
    listenIps: [
      {
        ip: "127.0.0.1",
        // announcedIp: ANNOUNCED_IP,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1000000,
  };

  try {
    const transport = await router.createWebRtcTransport(
      webRtcTransportOptions
    );
    console.log(`transport id: ${transport.id}`);

    transport.on("dtlsstatechange", (dtlsState) => {
      if (dtlsState === "closed") {
        transport.close();
      }
    });

    transport.on("close", () => {
      console.log("transport closed");
    });

    return transport;
  } catch (error) {
    console.error("Error creating WebRTC transport:", error);
    throw error;
  }
}

async function pipeProducersBetweenRouters({ producerIds, sourceRouter, targetRouter }) {
    try {
        if (!sourceRouter || !targetRouter) {
            console.error('Source or target router is undefined');
            return { pipeConsumer: null, pipeProducer: null };
        }

        if (!producerIds) {
            console.error('Producer ID is undefined');
            return { pipeConsumer: null, pipeProducer: null };
        }

        // Check if pipe already exists between these routers for this producer
        const pipeKey = `${sourceRouter.id}:${targetRouter.id}:${producerIds}`;
        if (pipeProducersBetweenRouters.activePipes?.has(pipeKey)) {
            console.log(`[PIPE] Pipe already exists for producer ${producerIds} between routers`);
            return pipeProducersBetweenRouters.activePipes.get(pipeKey);
        }

        // Initialize activePipes if not exists
        if (!pipeProducersBetweenRouters.activePipes) {
            pipeProducersBetweenRouters.activePipes = new Map();
        }

        try {
            console.log(`[PIPE] Creating new pipe for producer ${producerIds} between routers`);
            
            // Create pipe transport if needed
            const { pipeTransport: producerPipeTransport } = await sourceRouter.createPipeTransport({
                listenIp: { ip: '127.0.0.1', announcedIp: null },
                enableSctp: false
            });

            const { pipeTransport: consumerPipeTransport } = await targetRouter.createPipeTransport({
                listenIp: { ip: '127.0.0.1', announcedIp: null },
                enableSctp: false
            });

            // Connect pipe transports
            await producerPipeTransport.connect({
                ip: '127.0.0.1',
                port: consumerPipeTransport.tuple.localPort,
                srtpParameters: consumerPipeTransport.srtpParameters
            });

            await consumerPipeTransport.connect({
                ip: '127.0.0.1',
                port: producerPipeTransport.tuple.localPort,
                srtpParameters: producerPipeTransport.srtpParameters
            });

            // Get the producer from source router
            const producer = await sourceRouter.pipeToRouter({
                producerId: producerIds,
                router: targetRouter,
                enableSctp: false
            });

            const { pipeConsumer, pipeProducer } = producer;

            if (!pipeConsumer || !pipeProducer) {
                console.error('[PIPE] Failed to create pipe consumer or producer');
                return { pipeConsumer: null, pipeProducer: null };
            }

            // Store the pipe
            const pipeData = { pipeConsumer, pipeProducer };
            pipeProducersBetweenRouters.activePipes.set(pipeKey, pipeData);

            // Handle cleanup
            const cleanup = () => {
                pipeProducersBetweenRouters.activePipes.delete(pipeKey);
                if (!pipeConsumer.closed) pipeConsumer.close();
                if (!pipeProducer.closed) pipeProducer.close();
                if (!producerPipeTransport.closed) producerPipeTransport.close();
                if (!consumerPipeTransport.closed) consumerPipeTransport.close();
            };

            pipeConsumer.on('producerclose', cleanup);
            pipeProducer.on('transportclose', cleanup);

            console.log(`[PIPE] Successfully created pipe for producer ${producerIds}`);
            return pipeData;

        } catch (error) {
            console.error('[PIPE] Error in pipe creation:', error);
            pipeProducersBetweenRouters.activePipes.delete(pipeKey);
            return { pipeConsumer: null, pipeProducer: null };
        }
    } catch (error) {
        console.error('[PIPE] Error in pipeProducersBetweenRouters:', error);
        return { pipeConsumer: null, pipeProducer: null };
    }
}

// Initialize static map for tracking active pipes
pipeProducersBetweenRouters.activePipes = new Map();

// Improved CPU core tracking function
function getCpuUsagePerCore() {
    const cpus = os.cpus();
    const now = Date.now();
    
    // If we have previous measurements, use them for delta calculation
    if (getCpuUsagePerCore.prevCpus && getCpuUsagePerCore.prevTime) {
        const deltaTime = now - getCpuUsagePerCore.prevTime;
        
        return cpus.map((cpu, index) => {
            const prevCpu = getCpuUsagePerCore.prevCpus[index];
            if (!prevCpu) return { core: index, usage: 0 };

            const totalDelta = Object.values(cpu.times).reduce((acc, tv) => acc + tv, 0) -
                             Object.values(prevCpu.times).reduce((acc, tv) => acc + tv, 0);
            const idleDelta = cpu.times.idle - prevCpu.times.idle;
            const usage = totalDelta === 0 ? 0 : ((1 - idleDelta / totalDelta) * 100);

            return {
                core: index,
                usage: usage.toFixed(1),
                total: totalDelta,
                idle: idleDelta
            };
        });
    }

    // Store current measurements for next calculation
    getCpuUsagePerCore.prevCpus = cpus;
    getCpuUsagePerCore.prevTime = now;

    // First run, return 0 for all cores
    return cpus.map((_, index) => ({
        core: index,
        usage: "0.0"
    }));
}

// Initialize static properties
getCpuUsagePerCore.prevCpus = null;
getCpuUsagePerCore.prevTime = null;

module.exports = {
    createWorker,
    createWebRtcTransport,
    pipeProducersBetweenRouters,
    getCpuUsagePerCore
};
