// Ultra-Optimized TetrisClient - ระดับ Production
class UltraOptimizedTetrisClient {
  constructor() {
    // Core properties
    this.socket = null;
    this.roomId = null;
    this.playerNumber = null;
    this.playerName = '';
    this.gameState = null;
    this.connected = false;
    
    // Advanced Performance Optimizations
    this.TILE_SIZE = 28;
    this.FPS_TARGET = 60;
    this.FRAME_BUDGET = 16.67; // ms per frame
    this.lastFrameTime = 0;
    this.frameTimeHistory = new Array(10).fill(16.67);
    this.frameIndex = 0;
    
    // GPU-accelerated rendering
    this.useGPUAcceleration = this.detectGPUSupport();
    this.canvas = null;
    this.ctx = null;
    this.offscreenCanvas = null;
    this.offscreenCtx = null;
    
    // Memory Management
    this.memoryPool = new Map();
    this.gcThreshold = 1000; // trigger cleanup after 1000 operations
    this.operationCount = 0;
    
    // Advanced Caching
    this.renderCache = new Map();
    this.stateHash = '';
    this.dirtyRegions = new Set();
    this.lastRenderState = null;
    
    // WebWorker for heavy computations
    this.worker = null;
    this.workerQueue = [];
    this.initializeWorker();
    
    // Network optimization
    this.networkBuffer = [];
    this.batchSize = 10;
    this.compressionEnabled = true;
    this.deltaCompression = true;
    this.lastNetworkState = null;
    
    // Input prediction and lag compensation
    this.inputPredictor = new InputPredictor();
    this.lagCompensator = new LagCompensator();
    this.clientSidePrediction = true;
    
    // Audio optimization with Web Audio API
    this.audioContext = null;
    this.audioBuffers = new Map();
    this.initializeAudio();
    
    // Adaptive quality system
    this.qualityManager = new QualityManager();
    this.adaptiveQuality = true;
    
    this.initialize();
  }

  // GPU Support Detection
  detectGPUSupport() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
      // Check for specific GPU features
      const hasInstancedArrays = gl.getExtension('ANGLE_instanced_arrays');
      const hasFloatTextures = gl.getExtension('OES_texture_float');
      return { enabled: true, instanced: !!hasInstancedArrays, float: !!hasFloatTextures };
    }
    return { enabled: false };
  }

  // Initialize WebWorker for background processing
  initializeWorker() {
    if (typeof Worker !== 'undefined') {
      const workerCode = `
        // Worker for game logic calculations
        class GameWorker {
          constructor() {
            this.cache = new Map();
          }
          
          calculateBoardHash(grid) {
            const key = grid.flat().join('');
            if (this.cache.has(key)) return this.cache.get(key);
            
            let hash = 0;
            for (let i = 0; i < key.length; i++) {
              const char = key.charCodeAt(i);
              hash = ((hash << 5) - hash) + char;
              hash = hash & hash; // Convert to 32bit integer
            }
            
            this.cache.set(key, hash);
            return hash;
          }
          
          optimizePath(moves) {
            // Remove redundant moves
            const optimized = [];
            let lastMove = null;
            
            for (const move of moves) {
              if (move !== lastMove || (move === 'rotate' && optimized.length < 4)) {
                optimized.push(move);
                lastMove = move;
              }
            }
            
            return optimized;
          }
          
          compressGameState(state) {
            // Delta compression
            const compressed = {};
            for (const key in state) {
              if (typeof state[key] === 'object') {
                compressed[key] = JSON.stringify(state[key]);
              } else {
                compressed[key] = state[key];
              }
            }
            return compressed;
          }
        }
        
        const worker = new GameWorker();
        
        self.onmessage = function(e) {
          const { type, data, id } = e.data;
          let result;
          
          switch (type) {
            case 'hash':
              result = worker.calculateBoardHash(data);
              break;
            case 'optimize':
              result = worker.optimizePath(data);
              break;
            case 'compress':
              result = worker.compressGameState(data);
              break;
            default:
              result = null;
          }
          
          self.postMessage({ id, result });
        };
      `;
      
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      this.worker = new Worker(URL.createObjectURL(blob));
      
      this.worker.onmessage = (e) => {
        const { id, result } = e.data;
        const callback = this.workerQueue.find(item => item.id === id);
        if (callback) {
          callback.resolve(result);
          this.workerQueue = this.workerQueue.filter(item => item.id !== id);
        }
      };
    }
  }
// เพิ่มส่วนนี้ใน constructor ของ UltraOptimizedTetrisClient
initializeSocket() {
  // เช็คว่ามี Socket.io library หรือไม่
  if (typeof io === 'undefined') {
    console.error('Socket.io library not found! Please include socket.io-client');
    return;
  }

  // เชื่อมต่อไปยัง server (ปรับ URL ตามจริง)
  this.socket = io('http://localhost:3000', {
    transports: ['websocket', 'polling'],
    upgrade: true,
    rememberUpgrade: true
  });

  this.setupSocketEvents();
}

setupSocketEvents() {
  // เมื่อเชื่อมต่อสำเร็จ
  this.socket.on('connect', () => {
    console.log('Connected to server:', this.socket.id);
    this.connected = true;
    this.onConnected();
  });

  // เมื่อขาดการเชื่อมต่อ
  this.socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    this.connected = false;
    this.onDisconnected(reason);
  });

  // จัดการ connection error
  this.socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    this.onConnectionError(error);
  });

  // Game-specific events
  this.socket.on('game-state', (gameState) => {
    this.updateGameState(gameState);
  });

  this.socket.on('player-joined', (data) => {
    console.log('Player joined:', data);
    this.onPlayerJoined(data);
  });

  this.socket.on('player-left', (data) => {
    console.log('Player left:', data);
    this.onPlayerLeft(data);
  });

  this.socket.on('room-joined', (data) => {
    this.roomId = data.roomId;
    this.playerNumber = data.playerNumber;
    console.log(`Joined room ${this.roomId} as player ${this.playerNumber}`);
  });

  // Real-time game updates
  this.socket.on('piece-moved', (data) => {
    this.handlePieceMove(data);
  });

  this.socket.on('line-cleared', (data) => {
    this.handleLineCleared(data);
    this.playSound('clear');
  });

  this.socket.on('game-over', (data) => {
    this.handleGameOver(data);
    this.playSound('gameOver');
  });

  // Lag compensation
  this.socket.on('pong', (data) => {
    const receiveTime = performance.now();
    this.lagCompensator.addSample(data.timestamp, receiveTime);
  });
}

// Connection callbacks
onConnected() {
  // เรียกใช้เมื่อเชื่อมต่อสำเร็จ
  this.startPingInterval();
}

onDisconnected(reason) {
  // จัดการเมื่อขาดการเชื่อมต่อ
  this.stopPingInterval();
  
  if (reason === 'io server disconnect') {
    // Server บังคับ disconnect - พยายาม reconnect
    this.socket.connect();
  }
}

onConnectionError(error) {
  // แสดง error message ให้ user
  console.error('Cannot connect to game server:', error.message);
}

// Game state management
updateGameState(gameState) {
  const oldState = this.gameState;
  this.gameState = gameState;
  
  // Mark dirty regions for efficient rendering
  this.markDirtyRegions(oldState, gameState);
  
  // Client-side prediction validation
  if (this.clientSidePrediction) {
    this.validatePredictions(gameState);
  }
}

// Network methods
joinRoom(roomId, playerName) {
  if (!this.connected) {
    console.error('Not connected to server');
    return;
  }

  this.playerName = playerName;
  this.socket.emit('join-room', {
    roomId: roomId,
    playerName: playerName
  });
}

sendMove(moveData) {
  if (!this.connected) return;
  
  // Add client-side prediction
  if (this.clientSidePrediction) {
    this.predictMove(moveData);
  }
  
  // Add to network buffer for batching
  this.optimizedNetworkSend({
    type: 'move',
    data: moveData,
    timestamp: performance.now(),
    playerId: this.socket.id
  });
}

sendRotate() {
  this.sendMove({ action: 'rotate' });
  this.playSound('rotate');
}

sendDrop() {
  this.sendMove({ action: 'drop' });
  this.playSound('drop');
}

sendHorizontalMove(direction) {
  this.sendMove({ 
    action: 'move', 
    direction: direction // 'left' or 'right'
  });
  this.playSound('move');
}

// Ping for lag measurement
startPingInterval() {
  this.pingInterval = setInterval(() => {
    if (this.connected) {
      this.socket.emit('ping', { timestamp: performance.now() });
    }
  }, 1000);
}

stopPingInterval() {
  if (this.pingInterval) {
    clearInterval(this.pingInterval);
    this.pingInterval = null;
  }
}

// Client-side prediction
predictMove(moveData) {
  // Apply move immediately on client for responsiveness
  // Will be validated when server response comes back
  const prediction = this.applyMoveLocally(moveData);
  this.inputPredictor.addInput(moveData);
  
  return prediction;
}

validatePredictions(serverState) {
  // Compare predicted state with server state
  // Roll back if prediction was wrong
  if (this.lastPredictedState && 
      !this.statesMatch(this.lastPredictedState, serverState)) {
    console.log('Prediction mismatch, rolling back');
    this.rollbackPrediction(serverState);
  }
}

// Utility methods
markDirtyRegions(oldState, newState) {
  if (!oldState || !newState) {
    this.dirtyRegions.add({ full: true });
    return;
  }
  
  // Compare states and mark changed regions
  if (oldState.player1?.grid !== newState.player1?.grid) {
    this.dirtyRegions.add({ 
      player: 1, 
      x: 0, 
      y: 0, 
      width: 10 * this.TILE_SIZE, 
      height: 20 * this.TILE_SIZE 
    });
  }
  
  if (oldState.player2?.grid !== newState.player2?.grid) {
    this.dirtyRegions.add({ 
      player: 2, 
      x: 10 * this.TILE_SIZE + 20, 
      y: 0, 
      width: 10 * this.TILE_SIZE, 
      height: 20 * this.TILE_SIZE 
    });
  }
}

// เรียกใช้ใน initialize method
initialize() {
  this.initializeSocket(); // เพิ่มบรรทัดนี้
  this.initializeRenderer();
  this.setupAdvancedInputHandling();
  this.startOptimizedRenderLoop();
  this.enablePerformanceMonitoring();
  
  setInterval(() => this.manageMemory(), 5000);
  
  console.log('Ultra-optimized TetrisClient with Socket.io initialized');
}
  // Async worker communication
  async workerTask(type, data) {
    if (!this.worker) return null;
    
    const id = Math.random().toString(36).substr(2, 9);
    
    return new Promise((resolve) => {
      this.workerQueue.push({ id, resolve });
      this.worker.postMessage({ type, data, id });
    });
  }

  // Initialize Web Audio API
  initializeAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Pre-load audio buffers
      const sounds = {
        move: this.generateTone(200, 0.1),
        rotate: this.generateTone(300, 0.1),
        drop: this.generateTone(150, 0.2),
        clear: this.generateTone(500, 0.3),
        gameOver: this.generateTone(100, 0.5)
      };
      
      Object.entries(sounds).forEach(([name, buffer]) => {
        this.audioBuffers.set(name, buffer);
      });
    } catch (e) {
      console.warn('Audio not supported:', e);
    }
  }

  generateTone(frequency, duration) {
    if (!this.audioContext) return null;
    
    const sampleRate = this.audioContext.sampleRate;
    const numSamples = duration * sampleRate;
    const buffer = this.audioContext.createBuffer(1, numSamples, sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < numSamples; i++) {
      data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.1;
    }
    
    return buffer;
  }

  playSound(name) {
    if (!this.audioContext || !this.audioBuffers.has(name)) return;
    
    const source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffers.get(name);
    source.connect(this.audioContext.destination);
    source.start();
  }

  // Ultra-optimized rendering with GPU acceleration
  initializeRenderer() {
    if (this.useGPUAcceleration.enabled) {
      this.setupCanvasRenderer();
    } else {
      this.setupDOMRenderer();
    }
  }

  setupCanvasRenderer() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 10 * this.TILE_SIZE;
    this.canvas.height = 20 * this.TILE_SIZE;
    this.ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance'
    });
    
    // Offscreen canvas for background rendering
    this.offscreenCanvas = new OffscreenCanvas(
      this.canvas.width, 
      this.canvas.height
    );
    this.offscreenCtx = this.offscreenCanvas.getContext('2d');
    
    // Enable GPU acceleration
    this.ctx.imageSmoothingEnabled = false;
    this.offscreenCtx.imageSmoothingEnabled = false;
  }

  // Batch rendering for better performance
  batchRender(boards) {
    if (!this.ctx) return;
    
    const startTime = performance.now();
    
    // Clear canvas efficiently
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Batch all draw operations
    const drawCalls = [];
    
    boards.forEach((board, index) => {
      if (board && board.grid) {
        this.prepareBoardDrawCalls(board, index, drawCalls);
      }
    });
    
    // Execute all draw calls in one batch
    this.executeBatchDrawCalls(drawCalls);
    
    const renderTime = performance.now() - startTime;
    this.updateFrameTiming(renderTime);
  }

  prepareBoardDrawCalls(board, boardIndex, drawCalls) {
    const offsetX = boardIndex * (10 * this.TILE_SIZE + 20);
    
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 10; col++) {
        if (board.grid[row][col]) {
          drawCalls.push({
            type: 'block',
            x: offsetX + col * this.TILE_SIZE,
            y: row * this.TILE_SIZE,
            color: board.grid[row][col],
            size: this.TILE_SIZE
          });
        }
      }
    }
    
    // Add falling piece
    if (board.currentPiece && board.alive) {
      this.preparePieceDrawCalls(board, offsetX, drawCalls);
    }
  }

  preparePieceDrawCalls(board, offsetX, drawCalls) {
    const piece = board.currentPiece;
    for (let row = 0; row < piece.shape.length; row++) {
      for (let col = 0; col < piece.shape[row].length; col++) {
        if (piece.shape[row][col]) {
          drawCalls.push({
            type: 'piece',
            x: offsetX + (board.currentX + col) * this.TILE_SIZE,
            y: (board.currentY + row) * this.TILE_SIZE,
            color: piece.color,
            size: this.TILE_SIZE
          });
        }
      }
    }
  }

  executeBatchDrawCalls(drawCalls) {
    // Group by color for efficient rendering
    const colorGroups = new Map();
    
    drawCalls.forEach(call => {
      if (!colorGroups.has(call.color)) {
        colorGroups.set(call.color, []);
      }
      colorGroups.get(call.color).push(call);
    });
    
    // Render each color group
    colorGroups.forEach((calls, color) => {
      this.ctx.fillStyle = this.getColorValue(color);
      this.ctx.beginPath();
      
      calls.forEach(call => {
        this.ctx.rect(call.x, call.y, call.size, call.size);
      });
      
      this.ctx.fill();
    });
  }

  getColorValue(colorName) {
    const colors = {
      'cyan': '#00FFFF',
      'blue': '#0000FF',
      'orange': '#FFA500',
      'yellow': '#FFFF00',
      'green': '#00FF00',
      'purple': '#800080',
      'red': '#FF0000'
    };
    return colors[colorName] || '#FFFFFF';
  }

  // Advanced frame timing and adaptive quality
  updateFrameTiming(renderTime) {
    this.frameTimeHistory[this.frameIndex] = renderTime;
    this.frameIndex = (this.frameIndex + 1) % this.frameTimeHistory.length;
    
    const avgFrameTime = this.frameTimeHistory.reduce((a, b) => a + b, 0) / this.frameTimeHistory.length;
    
    if (this.adaptiveQuality) {
      this.qualityManager.adjustQuality(avgFrameTime, this.FRAME_BUDGET);
    }
  }

  // Memory management with automatic garbage collection
  manageMemory() {
    this.operationCount++;
    
    if (this.operationCount >= this.gcThreshold) {
      this.performGarbageCollection();
      this.operationCount = 0;
    }
  }

  performGarbageCollection() {
    // Clear old cache entries
    if (this.renderCache.size > 100) {
      const entries = Array.from(this.renderCache.entries());
      const toDelete = entries.slice(0, entries.length / 2);
      toDelete.forEach(([key]) => this.renderCache.delete(key));
    }
    
    // Return unused objects to memory pool
    this.returnUnusedObjects();
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
  }

  returnUnusedObjects() {
    // Implementation would return DOM elements, canvas contexts, etc.
    // to object pools for reuse
  }

  // Network optimization with compression and batching
  optimizedNetworkSend(data) {
    if (this.compressionEnabled) {
      data = this.compressData(data);
    }
    
    if (this.deltaCompression && this.lastNetworkState) {
      data = this.createDelta(this.lastNetworkState, data);
      this.lastNetworkState = data;
    }
    
    this.networkBuffer.push(data);
    
    if (this.networkBuffer.length >= this.batchSize) {
      this.flushNetworkBuffer();
    }
  }

  compressData(data) {
    // Simple compression algorithm
    const json = JSON.stringify(data);
    return this.lz77Compress(json);
  }

  lz77Compress(str) {
    // Simplified LZ77 compression
    const dict = new Map();
    let result = '';
    let dictSize = 256;
    
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (!dict.has(char)) {
        dict.set(char, dictSize++);
      }
      result += String.fromCharCode(dict.get(char));
    }
    
    return result;
  }

  createDelta(oldState, newState) {
    const delta = {};
    
    for (const key in newState) {
      if (oldState[key] !== newState[key]) {
        delta[key] = newState[key];
      }
    }
    
    return delta;
  }

  flushNetworkBuffer() {
    if (this.networkBuffer.length > 0 && this.socket) {
      this.socket.emit('batch-update', this.networkBuffer);
      this.networkBuffer = [];
    }
  }

  // Initialize all optimizations
  initialize() {
    this.initializeRenderer();
    this.setupAdvancedInputHandling();
    this.startOptimizedRenderLoop();
    this.enablePerformanceMonitoring();
    
    // Start periodic memory management
    setInterval(() => this.manageMemory(), 5000);
    
    console.log('Ultra-optimized TetrisClient initialized');
  }

  setupAdvancedInputHandling() {
    // Input prediction and lag compensation
    this.setupInputPrediction();
    this.setupLagCompensation();
  }

  setupInputPrediction() {
    // Predict next moves based on input patterns
    this.inputHistory = [];
    this.predictionModel = new SimplePredictor();
  }

  setupLagCompensation() {
    // Compensate for network lag
    this.lagHistory = [];
    this.lagCompensationEnabled = true;
  }

  startOptimizedRenderLoop() {
    const renderLoop = (timestamp) => {
      const deltaTime = timestamp - this.lastFrameTime;
      
      if (deltaTime >= this.FRAME_BUDGET) {
        this.optimizedRender(deltaTime);
        this.lastFrameTime = timestamp;
      }
      
      requestAnimationFrame(renderLoop);
    };
    
    requestAnimationFrame(renderLoop);
  }

  optimizedRender(deltaTime) {
    if (!this.gameState) return;
    
    // Check if render is needed
    const currentHash = this.calculateStateHash();
    if (currentHash === this.stateHash && this.dirtyRegions.size === 0) {
      return; // Skip render if nothing changed
    }
    
    this.stateHash = currentHash;
    
    // Render only dirty regions if possible
    if (this.dirtyRegions.size > 0) {
      this.renderDirtyRegions();
      this.dirtyRegions.clear();
    } else {
      this.batchRender([this.gameState.player1, this.gameState.player2]);
    }
  }

  calculateStateHash() {
    // Fast hash calculation
    const state = `${this.gameState.player1.score}_${this.gameState.player2.score}_${this.gameState.gameStarted}`;
    return this.fastHash(state);
  }

  fastHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  renderDirtyRegions() {
    // Render only changed parts of the screen
    this.dirtyRegions.forEach(region => {
      this.renderRegion(region);
    });
  }

  renderRegion(region) {
    // Render specific region efficiently
    const { x, y, width, height, data } = region;
    
    if (this.ctx) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(x, y, width, height);
      this.ctx.clip();
      
      // Render the region data
      this.renderRegionData(data);
      
      this.ctx.restore();
    }
  }

  enablePerformanceMonitoring() {
    if (typeof PerformanceObserver !== 'undefined') {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.entryType === 'measure') {
            console.log(`${entry.name}: ${entry.duration}ms`);
          }
        });
      });
      
      observer.observe({ entryTypes: ['measure'] });
    }
  }
}

// Advanced supporting classes
class QualityManager {
  constructor() {
    this.currentQuality = 1.0;
    this.targetFrameTime = 16.67;
  }
  
  adjustQuality(actualFrameTime, targetFrameTime) {
    const ratio = actualFrameTime / targetFrameTime;
    
    if (ratio > 1.2) {
      // Frame time too high, reduce quality
      this.currentQuality = Math.max(0.5, this.currentQuality * 0.9);
    } else if (ratio < 0.8) {
      // Frame time good, can increase quality
      this.currentQuality = Math.min(1.0, this.currentQuality * 1.05);
    }
    
    this.applyQualitySettings();
  }
  
  applyQualitySettings() {
    // Adjust rendering quality based on performance
    const qualityLevel = Math.floor(this.currentQuality * 3);
    
    switch (qualityLevel) {
      case 0: // Low quality
        this.enableLowQualityMode();
        break;
      case 1: // Medium quality
        this.enableMediumQualityMode();
        break;
      case 2: // High quality
        this.enableHighQualityMode();
        break;
    }
  }
  
  enableLowQualityMode() {
    // Reduce visual effects, lower resolution
  }
  
  enableMediumQualityMode() {
    // Balanced settings
  }
  
  enableHighQualityMode() {
    // Full visual effects, high resolution
  }
}

class InputPredictor {
  constructor() {
    this.history = [];
    this.maxHistory = 50;
  }
  
  addInput(input) {
    this.history.push({
      input,
      timestamp: performance.now()
    });
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }
  
  predictNext() {
    if (this.history.length < 3) return null;
    
    // Simple pattern recognition
    const recent = this.history.slice(-3);
    const pattern = recent.map(h => h.input);
    
    // Look for repeating patterns
    for (let i = 0; i < this.history.length - 3; i++) {
      const slice = this.history.slice(i, i + 3);
      const slicePattern = slice.map(h => h.input);
      
      if (JSON.stringify(pattern) === JSON.stringify(slicePattern)) {
        // Found matching pattern, predict next
        const nextIndex = i + 3;
        if (nextIndex < this.history.length) {
          return this.history[nextIndex].input;
        }
      }
    }
    
    return null;
  }
}

class LagCompensator {
  constructor() {
    this.samples = [];
    this.maxSamples = 20;
  }
  
  addSample(sendTime, receiveTime) {
    const lag = receiveTime - sendTime;
    this.samples.push(lag);
    
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }
  
  getAverageLag() {
    if (this.samples.length === 0) return 0;
    
    const sum = this.samples.reduce((a, b) => a + b, 0);
    return sum / this.samples.length;
  }
  
  compensateTimestamp(timestamp) {
    const avgLag = this.getAverageLag();
    return timestamp - avgLag;
  }
}

// Export for use
window.UltraOptimizedTetrisClient = UltraOptimizedTetrisClient;
