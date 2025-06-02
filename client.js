// TwoBob Tactics - Tetris Multiplayer Client
// =========================================

// Global Variables
let socket;
let gameState = {
    currentPlayer: null,
    room: null,
    isReady: false,
    inGame: false
};

// =========================================
// Socket Connection Management
// =========================================

function initSocket() {
    socket = io();
    
    // Connection Events
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus(true);
        enableButtons();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus(false);
        disableButtons();
        showScreen('connection-screen');
    });

    // Room Events
    socket.on('room-created', (data) => {
        gameState.room = data.roomId;
        gameState.currentPlayer = data.player;
        showScreen('waiting-screen');
        updateRoomDisplay();
    });

    socket.on('room-joined', (data) => {
        gameState.room = data.roomId;
        gameState.currentPlayer = data.player;
        showScreen('waiting-screen');
        updateRoomDisplay();
    });

    socket.on('room-full', () => {
        alert('ห้องเต็มแล้ว!');
        showScreen('menu-screen');
    });

    socket.on('room-not-found', () => {
        alert('ไม่พบห้องดังกล่าว!');
        showScreen('menu-screen');
    });

    socket.on('players-updated', (players) => {
        updatePlayersList(players);
    });

    socket.on('player-ready', (data) => {
        updateReadyStatus(data);
    });

    // Game Events
    socket.on('game-start', (data) => {
        gameState.inGame = true;
        showScreen('game-screen');
        initGame(data);
    });

    socket.on('game-state', (data) => {
        updateGameDisplay(data);
    });

    socket.on('game-over', (data) => {
        gameState.inGame = false;
        showGameOver(data);
    });

    socket.on('error', (message) => {
        alert('Error: ' + message);
    });
}

// =========================================
// UI Management Functions
// =========================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.style.display = 'none';
    });
    document.getElementById(screenId).style.display = 'block';
}

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    if (connected) {
        statusElement.className = 'connection-status connected';
        statusElement.innerHTML = '🟢 เชื่อมต่อแล้ว';
    } else {
        statusElement.className = 'connection-status disconnected';
        statusElement.innerHTML = '🔴 ไม่ได้เชื่อมต่อ';
    }
}

function enableButtons() {
    document.getElementById('btn-create-room').disabled = false;
    document.getElementById('btn-join-room').disabled = false;
}

function disableButtons() {
    document.getElementById('btn-create-room').disabled = true;
    document.getElementById('btn-join-room').disabled = true;
}

// =========================================
// Room Management Functions
// =========================================

function updateRoomDisplay() {
    document.getElementById('room-id-display').textContent = gameState.room;
}

function updatePlayersList(players) {
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    
    players.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `${player.name} ${player.ready ? '✅' : '⏳'}`;
        if (player.id === gameState.currentPlayer.id) {
            li.classList.add('current-player');
        }
        playersList.appendChild(li);
    });

    // Enable ready button if we have a name
    const readyBtn = document.getElementById('btn-ready');
    readyBtn.disabled = false;
}

function updateReadyStatus(data) {
    const indicator1 = document.getElementById('ready-indicator-1');
    const indicator2 = document.getElementById('ready-indicator-2');
    
    if (data.player1) {
        indicator1.textContent = `${data.player1.name}: ${data.player1.ready ? 'พร้อม ✅' : 'รอ... ⏳'}`;
    }
    if (data.player2) {
        indicator2.textContent = `${data.player2.name}: ${data.player2.ready ? 'พร้อม ✅' : 'รอ... ⏳'}`;
    }
}

// =========================================
// Game Functions
// =========================================

function initGame(gameData) {
    // Initialize game boards
    initGameBoard('my-board', 20, 10);
    initGameBoard('opponent-board', 20, 10);
    
    // Set player names
    document.getElementById('my-player-name').textContent = gameState.currentPlayer.name;
    document.getElementById('opponent-player-name').textContent = 'กำลังรอ...';
    
    // Reset scores
    resetGameStats();
    
    // Initialize game controls
    initGameControls();
}

function initGameBoard(boardId, rows, cols) {
    const board = document.getElementById(boardId);
    board.innerHTML = '';
    board.style.position = 'relative';
    
    // Create grid background
    const cellSize = boardId === 'my-board' ? 32 : 16;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.className = 'tetris-block grid-cell';
            cell.style.width = cellSize + 'px';
            cell.style.height = cellSize + 'px';
            cell.style.left = (c * cellSize) + 'px';
            cell.style.top = (r * cellSize) + 'px';
            cell.style.background = 'rgba(255,255,255,0.05)';
            cell.style.border = '1px solid rgba(255,255,255,0.1)';
            board.appendChild(cell);
        }
    }
}

function resetGameStats() {
    document.getElementById('my-score').textContent = '0';
    document.getElementById('my-lines').textContent = '0';
    document.getElementById('my-level').textContent = '1';
    document.getElementById('opponent-score').textContent = '0';
    document.getElementById('opponent-lines').textContent = '0';
    document.getElementById('opponent-level').textContent = '1';
}

function updateGameDisplay(gameData) {
    // Update scores and stats
    if (gameData.players) {
        const myData = gameData.players[gameState.currentPlayer.id];
        const opponentData = Object.values(gameData.players).find(p => p.id !== gameState.currentPlayer.id);
        
        if (myData) {
            document.getElementById('my-score').textContent = myData.score || 0;
            document.getElementById('my-lines').textContent = myData.lines || 0;
            document.getElementById('my-level').textContent = myData.level || 1;
        }
        
        if (opponentData) {
            document.getElementById('opponent-player-name').textContent = opponentData.name;
            document.getElementById('opponent-score').textContent = opponentData.score || 0;
            document.getElementById('opponent-lines').textContent = opponentData.lines || 0;
            document.getElementById('opponent-level').textContent = opponentData.level || 1;
        }
    }
    
    // Update game boards if board data is provided
    if (gameData.boards) {
        updateBoard('my-board', gameData.boards[gameState.currentPlayer.id]);
        const opponentId = Object.keys(gameData.boards).find(id => id !== gameState.currentPlayer.id);
        if (opponentId) {
            updateBoard('opponent-board', gameData.boards[opponentId]);
        }
    }
    
    // Update next piece if provided
    if (gameData.nextPieces && gameData.nextPieces[gameState.currentPlayer.id]) {
        updateNextPiece(gameData.nextPieces[gameState.currentPlayer.id]);
    }
}

function updateBoard(boardId, boardData) {
    if (!boardData) return;
    
    const board = document.getElementById(boardId);
    const cellSize = boardId === 'my-board' ? 32 : 16;
    
    // Clear existing game pieces (keep grid cells)
    const gamePieces = board.querySelectorAll('.tetris-block:not(.grid-cell)');
    gamePieces.forEach(piece => piece.remove());
    
    // Draw board state
    if (boardData.grid) {
        boardData.grid.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell) {
                    const block = document.createElement('div');
                    block.className = `tetris-block block-${cell}`;
                    block.style.width = cellSize + 'px';
                    block.style.height = cellSize + 'px';
                    block.style.left = (c * cellSize) + 'px';
                    block.style.top = (r * cellSize) + 'px';
                    board.appendChild(block);
                }
            });
        });
    }
    
    // Draw current piece if it exists
    if (boardData.currentPiece) {
        drawCurrentPiece(boardId, boardData.currentPiece, cellSize);
    }
}

function drawCurrentPiece(boardId, pieceData, cellSize) {
    const board = document.getElementById(boardId);
    
    if (pieceData.shape && pieceData.position) {
        const { x, y } = pieceData.position;
        
        pieceData.shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell) {
                    const block = document.createElement('div');
                    block.className = `tetris-block block-${pieceData.type} current-piece`;
                    block.style.width = cellSize + 'px';
                    block.style.height = cellSize + 'px';
                    block.style.left = ((x + c) * cellSize) + 'px';
                    block.style.top = ((y + r) * cellSize) + 'px';
                    block.style.opacity = '0.8';
                    board.appendChild(block);
                }
            });
        });
    }
}

function updateNextPiece(nextPieceData) {
    const nextPieceContainer = document.getElementById('next-piece-preview');
    nextPieceContainer.innerHTML = '';
    
    if (nextPieceData && nextPieceData.shape) {
        const blockSize = 20;
        
        nextPieceData.shape.forEach((row, r) => {
            row.forEach((cell, c) => {
                if (cell) {
                    const block = document.createElement('div');
                    block.className = `tetris-block block-${nextPieceData.type}`;
                    block.style.width = blockSize + 'px';
                    block.style.height = blockSize + 'px';
                    block.style.left = (c * blockSize) + 'px';
                    block.style.top = (r * blockSize) + 'px';
                    block.style.position = 'absolute';
                    nextPieceContainer.appendChild(block);
                }
            });
        });
    }
}

function showGameOver(data) {
    const winnerMessage = document.getElementById('winner-message');
    const finalScoreP1 = document.getElementById('final-score-p1');
    const finalScoreP2 = document.getElementById('final-score-p2');
    
    if (data.winner === gameState.currentPlayer.id) {
        winnerMessage.textContent = '🎉 คุณชนะ!';
        winnerMessage.style.color = '#4CAF50';
    } else {
        winnerMessage.textContent = '😢 คุณแพ้!';
        winnerMessage.style.color = '#f44336';
    }
    
    if (data.finalScores) {
        const scores = Object.values(data.finalScores);
        finalScoreP1.textContent = scores[0] || 0;
        finalScoreP2.textContent = scores[1] || 0;
    }
    
    showScreen('game-over-screen');
}

// =========================================
// Game Controls
// =========================================

function initGameControls() {
    // Keyboard controls
    document.addEventListener('keydown', handleKeyPress);
    
    // Mobile controls
    document.getElementById('btn-left').addEventListener('click', () => sendGameInput('left'));
    document.getElementById('btn-right').addEventListener('click', () => sendGameInput('right'));
    document.getElementById('btn-rotate').addEventListener('click', () => sendGameInput('rotate'));
    document.getElementById('btn-drop').addEventListener('click', () => sendGameInput('drop'));
    
    // Touch controls for swipe
    initTouchControls();
}

function initTouchControls() {
    let touchStartX = 0;
    let touchStartY = 0;
    
    const gameBoard = document.getElementById('my-board');
    
    gameBoard.addEventListener('touchstart', (e) => {
        e.preventDefault();
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    });
    
    gameBoard.addEventListener('touchend', (e) => {
        e.preventDefault();
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - touchStartX;
        const deltaY = touchEndY - touchStartY;
        
        const minSwipeDistance = 30;
        
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            // Horizontal swipe
            if (Math.abs(deltaX) > minSwipeDistance) {
                if (deltaX > 0) {
                    sendGameInput('right');
                } else {
                    sendGameInput('left');
                }
            }
        } else {
            // Vertical swipe
            if (Math.abs(deltaY) > minSwipeDistance) {
                if (deltaY > 0) {
                    sendGameInput('drop');
                } else {
                    sendGameInput('rotate');
                }
            }
        }
    });
}

function handleKeyPress(event) {
    if (!gameState.inGame) return;
    
    switch(event.key) {
        case 'ArrowLeft':
            event.preventDefault();
            sendGameInput('left');
            break;
        case 'ArrowRight':
            event.preventDefault();
            sendGameInput('right');
            break;
        case 'ArrowUp':
            event.preventDefault();
            sendGameInput('rotate');
            break;
        case 'ArrowDown':
            event.preventDefault();
            sendGameInput('down');
            break;
        case ' ':
            event.preventDefault();
            sendGameInput('drop');
            break;
        case 'Escape':
            event.preventDefault();
            togglePause();
            break;
    }
}

function sendGameInput(action) {
    if (socket && gameState.inGame) {
        socket.emit('game-input', { action: action });
    }
}

function togglePause() {
    if (socket && gameState.inGame) {
        socket.emit('pause-game');
    }
}

// =========================================
// UI Controls
// =========================================

function initControlsAccordion() {
    document.getElementById('controls-toggle').addEventListener('click', () => {
        const content = document.getElementById('controls-content');
        const icon = document.getElementById('toggle-icon');
        
        if (content.classList.contains('expanded')) {
            content.classList.remove('expanded');
            icon.classList.remove('rotated');
        } else {
            content.classList.add('expanded');
            icon.classList.add('rotated');
        }
    });
}

// =========================================
// Event Listeners Setup
// =========================================

function setupEventListeners() {
    // Menu buttons
    document.getElementById('btn-create-room').addEventListener('click', () => {
        showScreen('create-room-screen');
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
        showScreen('join-room-screen');
    });

    // Room creation
    document.getElementById('btn-confirm-create').addEventListener('click', () => {
        const playerName = document.getElementById('create-player-name').value.trim();
        if (!playerName) {
            alert('กรุณากรอกชื่อผู้เล่น');
            return;
        }
        socket.emit('create-room', { playerName: playerName });
    });

    // Room joining
    document.getElementById('btn-confirm-join').addEventListener('click', () => {
        const playerName = document.getElementById('join-player-name').value.trim();
        const roomId = document.getElementById('join-room-id').value.trim();
        if (!playerName || !roomId) {
            alert('กรุณากรอกชื่อผู้เล่นและรหัสห้อง');
            return;
        }
        socket.emit('join-room', { playerName: playerName, roomId: roomId });
    });

    // Ready button
    document.getElementById('btn-ready').addEventListener('click', () => {
        gameState.isReady = !gameState.isReady;
        socket.emit('player-ready', { ready: gameState.isReady });
        document.getElementById('btn-ready').textContent = gameState.isReady ? '⏳ ยกเลิกพร้อม' : '🎮 พร้อมเล่น';
    });

    // Leave room
    document.getElementById('btn-leave-room').addEventListener('click', () => {
        socket.emit('leave-room');
        gameState.room = null;
        gameState.currentPlayer = null;
        gameState.isReady = false;
        showScreen('menu-screen');
    });

    // Play again
    document.getElementById('btn-play-again').addEventListener('click', () => {
        socket.emit('play-again');
        showScreen('waiting-screen');
    });

    // Pause button
    document.getElementById('btn-pause').addEventListener('click', togglePause);

    // Input validation
    setupInputValidation();
}

function setupInputValidation() {
    // Allow only alphanumeric and Thai characters for player names
    const playerNameInputs = document.querySelectorAll('#create-player-name, #join-player-name');
    playerNameInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            // Allow Thai characters, English letters, numbers, and spaces
            e.target.value = e.target.value.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, '');
        });
    });

    // Allow only alphanumeric for room ID
    document.getElementById('join-room-id').addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    });

    // Enter key handling
    document.getElementById('create-player-name').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-confirm-create').click();
        }
    });

    document.getElementById('join-room-id').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('btn-confirm-join').click();
        }
    });
}

// =========================================
// Initialization
// =========================================

function init() {
    // Initialize socket connection
    initSocket();
    
    // Setup all event listeners
    setupEventListeners();
    
    // Initialize controls accordion
    initControlsAccordion();
    
    // Show initial screen
    showScreen('menu-screen');
    
    console.log('TwoBob Tactics Client initialized');
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Export functions for testing (if running in Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showScreen,
        updateConnectionStatus,
        sendGameInput,
        gameState
    };
}


// TwoBob Tactics - Tetris Multiplayer Client (Fixed)
class TetrisMultiplayer {
    constructor() {
        this.socket = null;
        this.gameState = {
            board: [],
            currentPiece: null,
            nextPiece: null,
            score: 0,
            lines: 0,
            level: 1,
            gameOver: false
        };
        this.opponentState = {
            board: [],
            score: 0,
            lines: 0,
            level: 1,
            gameOver: false
        };
        this.playerId = null;
        this.roomId = null;
        this.playerName = '';
        this.opponentName = '';
        this.isReady = false;
        this.gameStarted = false;
        
        // Tetris constants
        this.BOARD_WIDTH = 10;
        this.BOARD_HEIGHT = 20;
        this.BLOCK_SIZE = 28;
        this.SMALL_BLOCK_SIZE = 14; // For opponent board
        
        // Piece templates
        this.pieces = {
            I: { shape: [[1,1,1,1]], color: '#00f0f0' },
            O: { shape: [[1,1],[1,1]], color: '#f0f000' },
            T: { shape: [[0,1,0],[1,1,1]], color: '#a000f0' },
            S: { shape: [[0,1,1],[1,1,0]], color: '#00f000' },
            Z: { shape: [[1,1,0],[0,1,1]], color: '#f00000' },
            J: { shape: [[1,0,0],[1,1,1]], color: '#0000f0' },
            L: { shape: [[0,0,1],[1,1,1]], color: '#f0a000' }
        };
        
        this.pieceTypes = Object.keys(this.pieces);
        
        // Touch/swipe handling
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastMoveTime = 0;
        this.moveInterval = 500; // 500ms drop interval
        
        this.init();
    }

    init() {
        this.initializeBoard();
        this.setupEventListeners();
        this.connectToServer();
        this.setupMobileControls();
    }

    connectToServer() {
        // เชื่อมต่อกับ server (Render จะใช้ WSS โดยอัตโนมัติ)
        this.socket = io();
        
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateConnectionStatus(true);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.updateConnectionStatus(false);
            this.showScreen('connection-screen');
        });

        this.socket.on('roomCreated', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            console.log('Room created, I am player:', this.playerId);
            this.showWaitingScreen();
        });

        this.socket.on('roomJoined', (data) => {
            this.roomId = data.roomId;
            this.playerId = data.playerId;
            console.log('Room joined, I am player:', this.playerId);
            this.showWaitingScreen();
        });

        this.socket.on('roomError', (data) => {
            alert(data.message);
            this.showScreen('menu-screen');
        });

        this.socket.on('roomUpdate', (data) => {
            this.updatePlayersDisplay(data.players);
            this.updateReadyStatus(data.players);
            
            // Store opponent name
            const opponent = data.players.find(p => p.id !== this.playerId);
            if (opponent) {
                this.opponentName = opponent.name;
            }
        });

        this.socket.on('gameStart', (data) => {
            this.startGame(data);
        });

        this.socket.on('gameUpdate', (data) => {
            if (data.playerId !== this.playerId) {
                this.updateOpponentBoard(data);
            }
        });

        this.socket.on('gameOver', (data) => {
            this.endGame(data);
        });

        this.socket.on('playerLeft', () => {
            alert('ผู้เล่นคนอื่นออกจากห้อง');
            this.showScreen('menu-screen');
        });
    }

    updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connection-status');
        if (connected) {
            statusEl.className = 'connection-status connected';
            statusEl.innerHTML = '🟢 เชื่อมต่อแล้ว';
            document.getElementById('btn-create-room').disabled = false;
            document.getElementById('btn-join-room').disabled = false;
        } else {
            statusEl.className = 'connection-status disconnected';
            statusEl.innerHTML = '🔴 ไม่ได้เชื่อมต่อ';
            document.getElementById('btn-create-room').disabled = true;
            document.getElementById('btn-join-room').disabled = true;
        }
    }

    setupEventListeners() {
        // Create room
        document.getElementById('btn-confirm-create').addEventListener('click', () => {
            const name = document.getElementById('create-player-name').value.trim();
            if (!name) {
                alert('กรุณาใส่ชื่อผู้เล่น');
                return;
            }
            this.playerName = name;
            this.socket.emit('createRoom', { playerName: name });
        });

        // Join room
        document.getElementById('btn-confirm-join').addEventListener('click', () => {
            const name = document.getElementById('join-player-name').value.trim();
            const roomId = document.getElementById('join-room-id').value.trim();
            if (!name || !roomId) {
                alert('กรุณาใส่ชื่อผู้เล่นและรหัสห้อง');
                return;
            }
            this.playerName = name;
            this.socket.emit('joinRoom', { playerName: name, roomId: roomId });
        });

        // Ready button
        document.getElementById('btn-ready').addEventListener('click', () => {
            this.socket.emit('playerReady', { roomId: this.roomId });
        });

        // Leave room
        document.getElementById('btn-leave-room').addEventListener('click', () => {
            this.socket.emit('leaveRoom', { roomId: this.roomId });
            this.showScreen('menu-screen');
        });

        // Play again
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.socket.emit('playAgain', { roomId: this.roomId });
        });

        // Keyboard controls
        document.addEventListener('keydown', (e) => {
            if (this.gameStarted && !this.gameState.gameOver) {
                this.handleKeyPress(e.key);
            }
        });

        // Touch controls for mobile
        const gameScreen = document.getElementById('game-screen');
        gameScreen.addEventListener('touchstart', this.handleTouchStart.bind(this));
        gameScreen.addEventListener('touchmove', this.handleTouchMove.bind(this));
        gameScreen.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }

    setupMobileControls() {
        const buttons = document.querySelectorAll('.control-button');
        buttons.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                if (!this.gameStarted || this.gameState.gameOver) return;
                
                switch(index) {
                    case 0: this.rotatePiece(); break;        // ↶
                    case 1: this.rotatePiece(); break;        // ↑
                    case 2: this.hardDrop(); break;           // 💧
                    case 3: this.movePiece(-1, 0); break;     // ←
                    case 4: this.movePiece(0, 1); break;      // ↓
                    case 5: this.movePiece(1, 0); break;      // →
                }
            });
        });
    }

    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
    }

    handleTouchMove(e) {
        e.preventDefault();
    }

    handleTouchEnd(e) {
        if (!this.gameStarted || this.gameState.gameOver) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);

        if (absX > 30 || absY > 30) {
            if (absX > absY) {
                if (deltaX > 0) {
                    this.movePiece(1, 0); // Right
                } else {
                    this.movePiece(-1, 0); // Left
                }
            } else {
                if (deltaY > 0) {
                    this.movePiece(0, 1); // Down
                } else {
                    this.rotatePiece(); // Up - rotate
                }
            }
        }
    }

    handleKeyPress(key) {
        switch(key) {
            case 'ArrowLeft':
                this.movePiece(-1, 0);
                break;
            case 'ArrowRight':
                this.movePiece(1, 0);
                break;
            case 'ArrowDown':
                this.movePiece(0, 1);
                break;
            case 'ArrowUp':
                this.rotatePiece();
                break;
            case ' ':
                this.hardDrop();
                break;
        }
    }

    initializeBoard() {
        this.gameState.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
        this.opponentState.board = Array(this.BOARD_HEIGHT).fill().map(() => Array(this.BOARD_WIDTH).fill(0));
    }

    generatePiece() {
        const type = this.pieceTypes[Math.floor(Math.random() * this.pieceTypes.length)];
        return {
            type: type,
            shape: this.pieces[type].shape,
            color: this.pieces[type].color,
            x: Math.floor(this.BOARD_WIDTH / 2) - 1,
            y: 0
        };
    }

    startGame(data) {
        this.gameStarted = true;
        this.initializeBoard();
        this.gameState.currentPiece = this.generatePiece();
        this.gameState.nextPiece = this.generatePiece();
        this.gameState.score = 0;
        this.gameState.lines = 0;
        this.gameState.level = 1;
        this.gameState.gameOver = false;
        
        this.showScreen('game-screen');
        this.setupGameLayout();
        this.updateBoard();
        this.updateStats();
        this.gameLoop();
    }

    setupGameLayout() {
        // Update player names in the UI
        document.getElementById('my-player-name').textContent = this.playerName + ' (คุณ)';
        document.getElementById('opponent-player-name').textContent = this.opponentName || 'ฝ่ายตรงข้าม';
    }

    gameLoop() {
        if (!this.gameStarted || this.gameState.gameOver) return;
        
        const now = Date.now();
        if (now - this.lastMoveTime > this.moveInterval) {
            if (!this.movePiece(0, 1)) {
                this.placePiece();
                this.clearLines();
                this.spawnNewPiece();
                this.sendGameUpdate();
            }
            this.lastMoveTime = now;
        }
        
        requestAnimationFrame(() => this.gameLoop());
    }

    movePiece(dx, dy) {
        if (!this.gameState.currentPiece) return false;
        
        const newX = this.gameState.currentPiece.x + dx;
        const newY = this.gameState.currentPiece.y + dy;
        
        if (this.isValidPosition(this.gameState.currentPiece.shape, newX, newY)) {
            this.gameState.currentPiece.x = newX;
            this.gameState.currentPiece.y = newY;
            this.updateBoard();
            return true;
        }
        return false;
    }

    rotatePiece() {
        if (!this.gameState.currentPiece) return;
        
        const rotated = this.rotateMatrix(this.gameState.currentPiece.shape);
        if (this.isValidPosition(rotated, this.gameState.currentPiece.x, this.gameState.currentPiece.y)) {
            this.gameState.currentPiece.shape = rotated;
            this.updateBoard();
        }
    }

    hardDrop() {
        if (!this.gameState.currentPiece) return;
        
        while (this.movePiece(0, 1)) {
            // Keep dropping
        }
    }

    rotateMatrix(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const rotated = Array(cols).fill().map(() => Array(rows).fill(0));
        
        for (let i = 0; i < rows; i++) {
            for (let j = 0; j < cols; j++) {
                rotated[j][rows - 1 - i] = matrix[i][j];
            }
        }
        return rotated;
    }

    isValidPosition(shape, x, y) {
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j]) {
                    const newX = x + j;
                    const newY = y + i;
                    
                    if (newX < 0 || newX >= this.BOARD_WIDTH || 
                        newY >= this.BOARD_HEIGHT || 
                        (newY >= 0 && this.gameState.board[newY][newX])) {
                        return false;
                    }
                }
            }
        }
        return true;
    }

    placePiece() {
        if (!this.gameState.currentPiece) return;
        
        const { shape, x, y, color } = this.gameState.currentPiece;
        for (let i = 0; i < shape.length; i++) {
            for (let j = 0; j < shape[i].length; j++) {
                if (shape[i][j] && y + i >= 0) {
                    this.gameState.board[y + i][x + j] = color;
                }
            }
        }
    }

    clearLines() {
        let linesCleared = 0;
        for (let i = this.BOARD_HEIGHT - 1; i >= 0; i--) {
            if (this.gameState.board[i].every(cell => cell !== 0)) {
                this.gameState.board.splice(i, 1);
                this.gameState.board.unshift(Array(this.BOARD_WIDTH).fill(0));
                linesCleared++;
                i++; // Check same line again
            }
        }
        
        if (linesCleared > 0) {
            this.gameState.lines += linesCleared;
            this.gameState.score += linesCleared * 100 * this.gameState.level;
            this.gameState.level = Math.floor(this.gameState.lines / 10) + 1;
            this.moveInterval = Math.max(50, 500 - (this.gameState.level - 1) * 50);
            this.updateStats();
        }
    }

    spawnNewPiece() {
        this.gameState.currentPiece = this.gameState.nextPiece;
        this.gameState.nextPiece = this.generatePiece();
        
        if (!this.isValidPosition(this.gameState.currentPiece.shape, 
                                  this.gameState.currentPiece.x, 
                                  this.gameState.currentPiece.y)) {
            this.gameState.gameOver = true;
            this.socket.emit('gameOver', { 
                roomId: this.roomId, 
                playerId: this.playerId,
                score: this.gameState.score 
            });
        }
    }

    sendGameUpdate() {
        this.socket.emit('gameUpdate', {
            roomId: this.roomId,
            playerId: this.playerId,
            board: this.gameState.board,
            score: this.gameState.score,
            lines: this.gameState.lines,
            level: this.gameState.level
        });
    }

    // Update MY board (main board)
    updateBoard() {
        const boardEl = document.getElementById('my-board');
        if (!boardEl) return;
        
        boardEl.innerHTML = '';
        
        // Draw placed blocks
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (this.gameState.board[i][j]) {
                    const block = document.createElement('div');
                    block.className = 'tetris-block';
                    block.style.left = j * this.BLOCK_SIZE + 'px';
                    block.style.top = i * this.BLOCK_SIZE + 'px';
                    block.style.width = this.BLOCK_SIZE + 'px';
                    block.style.height = this.BLOCK_SIZE + 'px';
                    block.style.background = this.gameState.board[i][j];
                    block.style.border = '1px solid rgba(255,255,255,0.3)';
                    boardEl.appendChild(block);
                }
            }
        }
        
        // Draw current piece
        if (this.gameState.currentPiece) {
            const { shape, x, y, color } = this.gameState.currentPiece;
            for (let i = 0; i < shape.length; i++) {
                for (let j = 0; j < shape[i].length; j++) {
                    if (shape[i][j]) {
                        const block = document.createElement('div');
                        block.className = 'tetris-block current-piece';
                        block.style.left = (x + j) * this.BLOCK_SIZE + 'px';
                        block.style.top = (y + i) * this.BLOCK_SIZE + 'px';
                        block.style.width = this.BLOCK_SIZE + 'px';
                        block.style.height = this.BLOCK_SIZE + 'px';
                        block.style.background = color;
                        block.style.border = '2px solid rgba(255,255,255,0.8)';
                        block.style.boxShadow = '0 0 5px rgba(255,255,255,0.5)';
                        boardEl.appendChild(block);
                    }
                }
            }
        }
        
        // Show game over overlay
        if (this.gameState.gameOver) {
            const overlay = document.createElement('div');
            overlay.className = 'game-over-overlay';
            overlay.innerHTML = '<div class="game-over-text">GAME OVER</div>';
            boardEl.appendChild(overlay);
        }
    }

    // Update opponent board (smaller board)
    updateOpponentBoard(data) {
        console.log('Updating opponent board with data:', data);
        
        // Store opponent state
        this.opponentState.board = data.board || [];
        this.opponentState.score = data.score || 0;
        this.opponentState.lines = data.lines || 0;
        this.opponentState.level = data.level || 1;
        
        const boardEl = document.getElementById('opponent-board');
        if (!boardEl) return;
        
        boardEl.innerHTML = '';
        
        // Draw opponent's board with smaller blocks
        for (let i = 0; i < this.BOARD_HEIGHT; i++) {
            for (let j = 0; j < this.BOARD_WIDTH; j++) {
                if (data.board[i] && data.board[i][j]) {
                    const block = document.createElement('div');
                    block.className = 'tetris-block-small';
                    block.style.left = j * this.SMALL_BLOCK_SIZE + 'px';
                    block.style.top = i * this.SMALL_BLOCK_SIZE + 'px';
                    block.style.width = this.SMALL_BLOCK_SIZE + 'px';
                    block.style.height = this.SMALL_BLOCK_SIZE + 'px';
                    block.style.background = data.board[i][j];
                    block.style.border = '1px solid rgba(255,255,255,0.2)';
                    block.style.position = 'absolute';
                    boardEl.appendChild(block);
                }
            }
        }
        
        // Update opponent stats
        this.updateOpponentStats();
    }

    updateStats() {
        const scoreEl = document.getElementById('my-score');
        const linesEl = document.getElementById('my-lines');
        const levelEl = document.getElementById('my-level');
        
        if (scoreEl) scoreEl.textContent = this.gameState.score;
        if (linesEl) linesEl.textContent = this.gameState.lines;
        if (levelEl) levelEl.textContent = this.gameState.level;
    }

    updateOpponentStats() {
        const scoreEl = document.getElementById('opponent-score');
        const linesEl = document.getElementById('opponent-lines');
        const levelEl = document.getElementById('opponent-level');
        
        if (scoreEl) scoreEl.textContent = this.opponentState.score;
        if (linesEl) linesEl.textContent = this.opponentState.lines;
        if (levelEl) levelEl.textContent = this.opponentState.level;
    }

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = 'block';
        }
    }

    showWaitingScreen() {
        document.getElementById('room-id-display').textContent = this.roomId;
        this.showScreen('waiting-screen');
        document.getElementById('btn-ready').disabled = false;
    }

    updatePlayersDisplay(players) {
        const playersList = document.getElementById('players-list');
        if (!playersList) return;
        
        playersList.innerHTML = '';
        
        players.forEach((player, index) => {
            const li = document.createElement('li');
            li.textContent = `${player.name}`;
            if (player.id === this.playerId) {
                li.classList.add('current-player');
                li.textContent += ' (คุณ)';
            }
            playersList.appendChild(li);
        });
    }

    updateReadyStatus(players) {
        players.forEach((player, index) => {
            const indicator = document.getElementById(`ready-indicator-${index + 1}`);
            if (indicator) {
                indicator.textContent = `${player.name}: ${player.ready ? '✅ พร้อม' : '⏳ รอ...'}`;
            }
        });
    }

    endGame(data) {
        this.gameStarted = false;
        this.gameState.gameOver = true;
        
        const winnerMsg = document.getElementById('winner-message');
        if (winnerMsg) {
            winnerMsg.textContent = data.winner === this.playerId ? '🎉 คุณชนะ!' : '😢 คุณแพ้';
        }
        
        const finalScoreP1 = document.getElementById('final-score-p1');
        const finalScoreP2 = document.getElementById('final-score-p2');
        if (finalScoreP1) finalScoreP1.textContent = data.scores.player1 || 0;
        if (finalScoreP2) finalScoreP2.textContent = data.scores.player2 || 0;
        
        this.showScreen('game-over-screen');
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tetrisGame = new TetrisMultiplayer();
});
