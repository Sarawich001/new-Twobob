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
