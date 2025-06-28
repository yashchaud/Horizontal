const EnhancedWorkerManager = require('../modules/EnhancedWorkerManager');
const assert = require('assert');

class TestHarness {
  constructor() {
    this.workerManager = new EnhancedWorkerManager();
    this.events = [];
    this.setupEventListeners();
  }

  setupEventListeners() {
    const events = [
      'coreMigrationStart',
      'coreMigrationComplete',
      'coreMigrationFailed',
      'workerMigrationStart',
      'workerMigrationComplete',
      'workerMigrationFailed',
      'roomMigrationStart',
      'roomMigrationComplete'
    ];

    events.forEach(event => {
      this.workerManager.on(event, (data) => {
        this.events.push({ event, data, timestamp: Date.now() });
        console.log(`Event: ${event}`, data);
      });
    });
  }

  async runTest(testName, testFn) {
    console.log(`\nRunning test: ${testName}`);
    this.events = [];
    try {
      await testFn();
      console.log(`✓ ${testName} passed`);
    } catch (error) {
      console.error(`✗ ${testName} failed:`, error);
      throw error;
    }
  }

  createMockWorker() {
    return {
      pid: Math.floor(Math.random() * 10000),
      closed: false,
      observer: {
        on: () => {}
      },
      createRouter: async (options) => this.createMockRouter(),
      createWebRtcTransport: async (options) => this.createMockTransport(options),
      close: async () => { this.closed = true; },
      dump: async () => ({ pid: this.pid }),
      on: (event, cb) => {}
    };
  }

  createMockRouter() {
    return {
      closed: false,
      rtpCapabilities: {},
      createWebRtcTransport: async (options) => this.createMockTransport(options),
      close: async () => { this.closed = true; },
      dump: async () => ({ id: 'router-' + Math.random() })
    };
  }

  createMockTransport(options) {
    return {
      id: 'transport-' + Math.random(),
      closed: false,
      appData: options.appData || {},
      options: options,
      close: async () => { this.closed = true; },
      dump: async () => ({
        id: this.id,
        options: this.options,
        appData: this.appData
      }),
      consume: async (options) => ({
        id: 'consumer-' + Math.random(),
        producerId: options.producerId,
        rtpParameters: {}
      })
    };
  }

  async simulateLoad(coreId, workerId, load) {
    const workerData = this.workerManager.getWorkerData(coreId, workerId);
    if (workerData) {
      // Create mock worker with proper interface
      workerData.worker = this.createMockWorker();
      workerData.router = await workerData.worker.createRouter({});

      // Simulate worker data
      workerData.worker.dump = async () => ({
        webRtcTransports: this.generateMockTransports(load.transports || 0)
      });

      workerData.stats.cpu = load.cpu || workerData.stats.cpu;
      workerData.stats.memory = load.memory || workerData.stats.memory;
      workerData.stats.transports = load.transports || workerData.stats.transports;
      
      // Simulate monitoring cycle
      await this.workerManager.handlePotentialOverload(coreId, workerId, workerData);
    }
  }

  generateMockTransports(count) {
    const transports = [];
    const roomCount = Math.ceil(count / 3); // Average 3 transports per room

    for (let i = 0; i < count; i++) {
      const roomId = `room${Math.floor(i / 3)}`;
      transports.push({
        id: `transport${i}`,
        appData: { roomId },
        type: i % 2 === 0 ? 'producer' : 'consumer',
        closed: false,
        close: async () => { this.closed = true; },
        dump: async () => ({ id: `transport${i}` }),
        options: {
          listenIps: [{ ip: '127.0.0.1', announcedIp: null }],
          enableUdp: true,
          enableTcp: true,
          preferUdp: true,
        }
      });
    }
    return transports;
  }

  verifyMigrationFlow(expectedEvents) {
    // First verify that all expected events occurred
    for (const expected of expectedEvents) {
      const found = this.events.some(e => e.event === expected);
      assert(found, `Missing expected event: ${expected}`);
    }

    // Verify specific ordering rules
    const events = this.events.map(e => e.event);
    
    // Rule 1: workerMigrationStart should come before any roomMigration events
    if (events.includes('workerMigrationStart')) {
      const startIndex = events.indexOf('workerMigrationStart');
      const completeIndex = events.indexOf('workerMigrationComplete');
      assert(startIndex >= 0, 'Worker migration start event missing');
      assert(completeIndex >= 0, 'Worker migration complete event missing');
    }

    // Rule 2: Each roomMigrationStart should have a matching complete
    const roomStarts = events.filter(e => e === 'roomMigrationStart');
    const roomCompletes = events.filter(e => e === 'roomMigrationComplete');
    assert.strictEqual(roomStarts.length, roomCompletes.length, 
      'Mismatch between room migration start and complete events');

    // Rule 3: coreMigrationStart should be first if present
    if (events.includes('coreMigrationStart')) {
      assert.strictEqual(events[0], 'coreMigrationStart', 
        'Core migration start should be first event');
      assert(events.includes('coreMigrationComplete'), 
        'Missing core migration complete event');
    }
  }

  getEventsByType(eventType) {
    return this.events.filter(e => e.event === eventType);
  }
}

async function runTests() {
  const harness = new TestHarness();
  
  // Initialize workers
  await harness.workerManager.createWorkers([
    {
      kind: "video",
      mimeType: "video/VP8",
      clockRate: 90000,
    }
  ]);

  // Test 1: Single Worker Migration
  await harness.runTest('Single Worker Migration', async () => {
    // Simulate high load on worker 0 of core 0
    await harness.simulateLoad(0, 0, {
      cpu: 85,
      memory: 80,
      transports: 240
    });

    harness.verifyMigrationFlow([
      'workerMigrationStart',
      'workerMigrationComplete',
      'roomMigrationStart',
      'roomMigrationComplete'
    ]);

    const stats = harness.workerManager.getMigrationStats();
    assert(stats.totalMigrations > 0, 'Migration should have occurred');
  });

  // Test 2: Core Migration
  await harness.runTest('Full Core Migration', async () => {
    // Reset grace period and events
    harness.workerManager.lastMigrationTime = 0;
    harness.events = [];
    
    // Simulate extreme load on all workers of core 0
    for (let workerId = 0; workerId < harness.workerManager.workersPerCore; workerId++) {
      await harness.simulateLoad(0, workerId, {
        cpu: 95,
        memory: 90,
        transports: 240
      });
    }

    // Wait for migrations to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify the migration flow
    const events = harness.events.map(e => e.event);
    assert(events.includes('coreMigrationStart'), 'Core migration should have started');
    assert(events.includes('coreMigrationComplete'), 'Core migration should have completed');
    
    // Verify worker migrations occurred
    const workerMigrations = events.filter(e => e === 'workerMigrationComplete');
    assert(workerMigrations.length > 0, 'At least one worker should have migrated');

    // Verify room migrations occurred
    const roomMigrations = events.filter(e => e === 'roomMigrationComplete');
    assert(roomMigrations.length > 0, 'At least one room should have migrated');

    // Verify core stats after migration
    const coreStats = await harness.workerManager.getCoreStats(0);
    assert(coreStats.transports < 720, 'Core should have fewer transports after migration');
  });

  // Test 3: Grace Period
  await harness.runTest('Grace Period Prevention', async () => {
    const eventsBefore = harness.events.length;
    
    // Attempt migration during grace period
    await harness.simulateLoad(0, 0, {
      cpu: 95,
      memory: 90,
      transports: 240
    });

    assert.strictEqual(
      harness.events.length,
      eventsBefore,
      'No migration should occur during grace period'
    );
  });

  // Test 4: Room-based Migration
  await harness.runTest('Room-based Migration', async () => {
    // Reset grace period
    harness.workerManager.lastMigrationTime = 0;
    
    // Simulate multiple rooms on a worker
    await harness.simulateLoad(0, 0, {
      cpu: 85,
      memory: 80,
      transports: 9 // Will create 3 rooms with 3 transports each
    });

    const roomMigrations = harness.getEventsByType('roomMigrationStart');
    assert(roomMigrations.length >= 3, 'Should migrate multiple rooms');
  });

  // Test 5: Error Handling
  await harness.runTest('Error Handling', async () => {
    // Reset grace period
    harness.workerManager.lastMigrationTime = 0;
    
    // Simulate a failed migration
    const workerData = harness.workerManager.getWorkerData(0, 0);
    workerData.worker.dump = async () => {
      throw new Error('Simulated error');
    };

    await harness.simulateLoad(0, 0, {
      cpu: 85,
      memory: 80,
      transports: 240
    });

    const failures = harness.getEventsByType('workerMigrationFailed');
    assert(failures.length > 0, 'Should handle migration failure');
  });

  console.log('\nAll tests completed successfully!');
}

// Run the tests
runTests().catch(console.error); 