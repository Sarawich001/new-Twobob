// TwoBob Tactics - Tetris Multiplayer Client (Fixed Version)
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
        console.error('Socket error:', message);
        alert('Error: ' + message);
    });
}

// =========================================
// UI Management Functions (with null checks)
// =========================================

function showScreen(screenId) {
    try {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.style.display = 'none';
        });
        
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.style.display = 'block';
        } else {
            console.error(`Screen not found: ${screenId}`);
        }
    } catch (error) {
        console.error('Error showing screen:', error);
    }
}

function updateConnectionStatus(connected) {
    try {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            if (connected) {
                statusElement.className = 'connection-status connected';
                statusElement.innerHTML = '🟢 เชื่อมต่อแล้ว';
            } else {
                statusElement.className = 'connection-status disconnected';
                statusElement.innerHTML = '🔴 ไม่ได้เชื่อมต่อ';
            }
        }
    } catch (error) {
        console.error('Error updating connection status:', error);
    }
}

function enableButtons() {
    try {
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        
        if (createBtn) createBtn.disabled = false;
        if (joinBtn) joinBtn.disabled = false;
    } catch (error) {
        console.error('Error enabling buttons:', error);
    }
}

function disableButtons() {
    try {
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        
        if (createBtn) createBtn.disabled = true;
        if (joinBtn) joinBtn.disabled = true;
    } catch (error) {
        console.error('Error disabling buttons:', error);
    }
}

// =========================================
// Room Management Functions (with null checks)
// =========================================

function updateRoomDisplay() {
    try {
        const roomDisplay = document.getElementById('room-id-display');
        if (roomDisplay) {
            roomDisplay.textContent = gameState.room || '-';
        }
    } catch (error) {
        console.error('Error updating room display:', error);
    }
}

function updatePlayersList(players) {
    try {
        const playersList = document.getElementById('players-list');
        if (!playersList) return;
        
        playersList.innerHTML = '';
        
        if (Array.isArray(players)) {
            players.forEach((player, index) => {
                const li = document.createElement('li');
                li.textContent = `${player.name || 'Unknown'} ${player.ready ? '✅' : '⏳'}`;
                if (gameState.currentPlayer && player.id === gameState.currentPlayer.id) {
                    li.classList.add('current-player');
                }
                playersList.appendChild(li);
            });
        }

        // Enable ready button if we have a name
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.disabled = false;
        }
    } catch (error) {
        console.error('Error updating players list:', error);
    }
}

function updateReadyStatus(data) {
    try {
        const indicator1 = document.getElementById('ready-indicator-1');
        const indicator2 = document.getElementById('ready-indicator-2');
        
        if (indicator1 && data.player1) {
            indicator1.textContent = `${data.player1.name}: ${data.player1.ready ? 'พร้อม ✅' : 'รอ... ⏳'}`;
        }
        if (indicator2 && data.player2) {
            indicator2.textContent = `${data.player2.name}: ${data.player2.ready ? 'พร้อม ✅' : 'รอ... ⏳'}`;
        }
    } catch (error) {
        console.error('Error updating ready status:', error);
    }
}

// =========================================
// Game Functions (with error handling)
// =========================================

function initGame(gameData) {
    try {
        // Initialize game boards
        initGameBoard('my-board', 20, 10);
        initGameBoard('opponent-board', 20, 10);
        
        // Set player names
        const myNameEl = document.getElementById('my-player-name');
        const oppNameEl = document.getElementById('opponent-player-name');
        
        if (myNameEl && gameState.currentPlayer) {
            myNameEl.textContent = gameState.currentPlayer.name || 'YOU';
        }
        if (oppNameEl) {
            oppNameEl.textContent = 'กำลังรอ...';
        }
        
        // Reset scores
        resetGameStats();
        
        // Initialize game controls
        initGameControls();
    } catch (error) {
        console.error('Error initializing game:', error);
    }
}

function initGameBoard(boardId, rows, cols) {
    try {
        const board = document.getElementById(boardId);
        if (!board) {
            console.error(`Game board not found: ${boardId}`);
            return;
        }
        
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
                cell.style.position = 'absolute';
                cell.style.background = 'rgba(255,255,255,0.05)';
                cell.style.border = '1px solid rgba(255,255,255,0.1)';
                board.appendChild(cell);
            }
        }
    } catch (error) {
        console.error('Error initializing game board:', error);
    }
}

function resetGameStats() {
    try {
        const elements = {
            'my-score': '0',
            'my-lines': '0',
            'my-level': '1',
            'opponent-score': '0',
            'opponent-lines': '0',
            'opponent-level': '1'
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = value;
            }
        });
    } catch (error) {
        console.error('Error resetting game stats:', error);
    }
}

function updateGameDisplay(gameData) {
    try {
        // Update scores and stats
        if (gameData.players && gameState.currentPlayer) {
            const myData = gameData.players[gameState.currentPlayer.id];
            const opponentData = Object.values(gameData.players).find(p => p.id !== gameState.currentPlayer.id);
            
            if (myData) {
                const myScore = document.getElementById('my-score');
                const myLines = document.getElementById('my-lines');
                const myLevel = document.getElementById('my-level');
                
                if (myScore) myScore.textContent = myData.score || 0;
                if (myLines) myLines.textContent = myData.lines || 0;
                if (myLevel) myLevel.textContent = myData.level || 1;
            }
            
            if (opponentData) {
                const oppName = document.getElementById('opponent-player-name');
                const oppScore = document.getElementById('opponent-score');
                const oppLines = document.getElementById('opponent-lines');
                const oppLevel = document.getElementById('opponent-level');
                
                if (oppName) oppName.textContent = opponentData.name || 'ฝ่ายตรงข้าม';
                if (oppScore) oppScore.textContent = opponentData.score || 0;
                if (oppLines) oppLines.textContent = opponentData.lines || 0;
                if (oppLevel) oppLevel.textContent = opponentData.level || 1;
            }
        }
        
        // Update game boards if board data is provided
        if (gameData.boards && gameState.currentPlayer) {
            updateBoard('my-board', gameData.boards[gameState.currentPlayer.id]);
            const opponentId = Object.keys(gameData.boards).find(id => id !== gameState.currentPlayer.id);
            if (opponentId) {
                updateBoard('opponent-board', gameData.boards[opponentId]);
            }
        }
        
        // Update next piece if provided
        if (gameData.nextPieces && gameState.currentPlayer && gameData.nextPieces[gameState.currentPlayer.id]) {
            updateNextPiece(gameData.nextPieces[gameState.currentPlayer.id]);
        }
    } catch (error) {
        console.error('Error updating game display:', error);
    }
}

function updateBoard(boardId, boardData) {
    try {
        if (!boardData) return;
        
        const board = document.getElementById(boardId);
        if (!board) return;
        
        const cellSize = boardId === 'my-board' ? 32 : 16;
        
        // Clear existing game pieces (keep grid cells)
        const gamePieces = board.querySelectorAll('.tetris-block:not(.grid-cell)');
        gamePieces.forEach(piece => piece.remove());
        
        // Draw board state
        if (boardData.grid && Array.isArray(boardData.grid)) {
            boardData.grid.forEach((row, r) => {
                if (Array.isArray(row)) {
                    row.forEach((cell, c) => {
                        if (cell) {
                            const block = document.createElement('div');
                            block.className = `tetris-block block-${cell}`;
                            block.style.width = cellSize + 'px';
                            block.style.height = cellSize + 'px';
                            block.style.left = (c * cellSize) + 'px';
                            block.style.top = (r * cellSize) + 'px';
                            block.style.position = 'absolute';
                            board.appendChild(block);
                        }
                    });
                }
            });
        }
        
        // Draw current piece if it exists
        if (boardData.currentPiece) {
            drawCurrentPiece(boardId, boardData.currentPiece, cellSize);
        }
    } catch (error) {
        console.error('Error updating board:', error);
    }
}

function drawCurrentPiece(boardId, pieceData, cellSize) {
    try {
        const board = document.getElementById(boardId);
        if (!board || !pieceData) return;
        
        if (pieceData.shape && pieceData.position && Array.isArray(pieceData.shape)) {
            const { x, y } = pieceData.position;
            
            pieceData.shape.forEach((row, r) => {
                if (Array.isArray(row)) {
                    row.forEach((cell, c) => {
                        if (cell) {
                            const block = document.createElement('div');
                            block.className = `tetris-block block-${pieceData.type} current-piece`;
                            block.style.width = cellSize + 'px';
                            block.style.height = cellSize + 'px';
                            block.style.left = ((x + c) * cellSize) + 'px';
                            block.style.top = ((y + r) * cellSize) + 'px';
                            block.style.position = 'absolute';
                            block.style.opacity = '0.8';
                            board.appendChild(block);
                        }
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error drawing current piece:', error);
    }
}

function updateNextPiece(nextPieceData) {
    try {
        const nextPieceContainer = document.getElementById('next-piece-preview');
        if (!nextPieceContainer) return;
        
        nextPieceContainer.innerHTML = '';
        
        if (nextPieceData && nextPieceData.shape && Array.isArray(nextPieceData.shape)) {
            const blockSize = 20;
            
            nextPieceData.shape.forEach((row, r) => {
                if (Array.isArray(row)) {
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
                }
            });
        }
    } catch (error) {
        console.error('Error updating next piece:', error);
    }
}

function showGameOver(data) {
    try {
        const winnerMessage = document.getElementById('winner-message');
        const finalScoreP1 = document.getElementById('final-score-p1');
        const finalScoreP2 = document.getElementById('final-score-p2');
        
        if (winnerMessage) {
            if (gameState.currentPlayer && data.winner === gameState.currentPlayer.id) {
                winnerMessage.textContent = '🎉 คุณชนะ!';
                winnerMessage.style.color = '#4CAF50';
            } else {
                winnerMessage.textContent = '😢 คุณแพ้!';
                winnerMessage.style.color = '#f44336';
            }
        }
        
        if (data.finalScores && finalScoreP1 && finalScoreP2) {
            const scores = Object.values(data.finalScores);
            finalScoreP1.textContent = scores[0] || 0;
            finalScoreP2.textContent = scores[1] || 0;
        }
        
        showScreen('game-over-screen');
    } catch (error) {
        console.error('Error showing game over:', error);
    }
}

// =========================================
// Game Controls (with error handling)
// =========================================

function initGameControls() {
    try {
        // Remove existing event listeners first
        document.removeEventListener('keydown', handleKeyPress);
        
        // Keyboard controls
        document.addEventListener('keydown', handleKeyPress);
        
        // Mobile controls
        const buttons = {
            'btn-left': 'left',
            'btn-right': 'right',
            'btn-rotate': 'rotate',
            'btn-drop': 'drop'
        };
        
        Object.entries(buttons).forEach(([btnId, action]) => {
            const btn = document.getElementById(btnId);
            if (btn) {
                // Remove existing listeners
                btn.replaceWith(btn.cloneNode(true));
                const newBtn = document.getElementById(btnId);
                newBtn.addEventListener('click', () => sendGameInput(action));
            }
        });
        
        // Touch controls for swipe
        initTouchControls();
    } catch (error) {
        console.error('Error initializing game controls:', error);
    }
}

function initTouchControls() {
    try {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchStartTime = 0;
        const QUICK_TAP_THRESHOLD = 200; // 200ms สำหรับแยก tap กับ hold
        
        const gameBoard = document.getElementById('my-board');
        if (!gameBoard) return;
        
        // Remove existing listeners
        const newBoard = gameBoard.cloneNode(true);
        gameBoard.parentNode.replaceChild(newBoard, gameBoard);
        const freshBoard = document.getElementById('my-board');
        
        freshBoard.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (e.touches && e.touches[0]) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                touchStartTime = Date.now(); // บันทึกเวลาที่เริ่มสัมผัส
            }
        });
        
        freshBoard.addEventListener('touchend', (e) => {
            e.preventDefault();
            if (!e.changedTouches || !e.changedTouches[0]) return;
            
            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;
            const touchDuration = Date.now() - touchStartTime; // คำนวณระยะเวลาที่สัมผัส
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            const minSwipeDistance = 30;
            
            // ตรวจสอบ swipe ก่อน (การเลื่อนนิ้วระยะไกล)
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
                // Horizontal swipe - เลื่อนซ้าย/ขวา
                if (deltaX > 0) {
                    sendGameInput('right');
                } else {
                    sendGameInput('left');
                }
            } else if (Math.abs(deltaY) > minSwipeDistance && deltaY > 0) {
                // Vertical swipe down - Soft drop (ลงช้าๆ)
                sendGameInput('down');
            } else {
                // ไม่ใช่ swipe = เป็น tap หรือ hold
                if (touchDuration > QUICK_TAP_THRESHOLD) {
                    // Hold นาน = Hard Drop (ปล่อยลงเลย)
                    sendGameInput('drop');
                } else {
                    // Tap เร็ว = หมุนบล็อค
                    sendGameInput('rotate');
                }
            }
        });
    } catch (error) {
        console.error('Error initializing touch controls:', error);
    }
}

function handleKeyPress(event) {
    try {
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
    } catch (error) {
        console.error('Error handling key press:', error);
    }
}

function sendGameInput(action) {
    try {
        if (socket && gameState.inGame) {
            socket.emit('game-input', { action: action });
        }
    } catch (error) {
        console.error('Error sending game input:', error);
    }
}

function togglePause() {
    try {
        if (socket && gameState.inGame) {
            socket.emit('pause-game');
        }
    } catch (error) {
        console.error('Error toggling pause:', error);
    }
}

// =========================================
// UI Controls (with error handling)
// =========================================

function initControlsAccordion() {
    try {
        const toggleBtn = document.getElementById('controls-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const content = document.getElementById('controls-content');
                const icon = document.getElementById('toggle-icon');
                
                if (content && icon) {
                    if (content.classList.contains('expanded')) {
                        content.classList.remove('expanded');
                        icon.classList.remove('rotated');
                    } else {
                        content.classList.add('expanded');
                        icon.classList.add('rotated');
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error initializing controls accordion:', error);
    }
}

// =========================================
// Event Listeners Setup (with error handling)
// =========================================

function setupEventListeners() {
    try {
        // Menu buttons
        const createBtn = document.getElementById('btn-create-room');
        const joinBtn = document.getElementById('btn-join-room');
        
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                showScreen('create-room-screen');
            });
        }

        if (joinBtn) {
            joinBtn.addEventListener('click', () => {
                showScreen('join-room-screen');
            });
        }

        // Room creation
        const confirmCreateBtn = document.getElementById('btn-confirm-create');
        if (confirmCreateBtn) {
            confirmCreateBtn.addEventListener('click', () => {
                const playerNameInput = document.getElementById('create-player-name');
                const playerName = playerNameInput ? playerNameInput.value.trim() : '';
                
                if (!playerName) {
                    alert('กรุณากรอกชื่อผู้เล่น');
                    return;
                }
                if (socket) {
                    socket.emit('create-room', { playerName: playerName });
                }
            });
        }

        // Room joining
        const confirmJoinBtn = document.getElementById('btn-confirm-join');
        if (confirmJoinBtn) {
            confirmJoinBtn.addEventListener('click', () => {
                const playerNameInput = document.getElementById('join-player-name');
                const roomIdInput = document.getElementById('join-room-id');
                
                const playerName = playerNameInput ? playerNameInput.value.trim() : '';
                const roomId = roomIdInput ? roomIdInput.value.trim() : '';
                
                if (!playerName || !roomId) {
                    alert('กรุณากรอกชื่อผู้เล่นและรหัสห้อง');
                    return;
                }
                if (socket) {
                    socket.emit('join-room', { playerName: playerName, roomId: roomId });
                }
            });
        }

        // Ready button
        const readyBtn = document.getElementById('btn-ready');
        if (readyBtn) {
            readyBtn.addEventListener('click', () => {
                gameState.isReady = !gameState.isReady;
                if (socket) {
                    socket.emit('player-ready', { ready: gameState.isReady });
                }
                readyBtn.textContent = gameState.isReady ? '⏳ ยกเลิกพร้อม' : '🎮 พร้อมเล่น';
            });
        }

        // Leave room
        const leaveBtn = document.getElementById('btn-leave-room');
        if (leaveBtn) {
            leaveBtn.addEventListener('click', () => {
                if (socket) {
                    socket.emit('leave-room');
                }
                gameState.room = null;
                gameState.currentPlayer = null;
                gameState.isReady = false;
                showScreen('menu-screen');
            });
        }

        // Play again
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            playAgainBtn.addEventListener('click', () => {
                if (socket) {
                    socket.emit('play-again');
                }
                showScreen('waiting-screen');
            });
        }

        // Input validation
        setupInputValidation();
    } catch (error) {
        console.error('Error setting up event listeners:', error);
    }
}

function setupInputValidation() {
    try {
        // Allow only alphanumeric and Thai characters for player names
        const playerNameInputs = document.querySelectorAll('#create-player-name, #join-player-name');
        playerNameInputs.forEach(input => {
            if (input) {
                input.addEventListener('input', (e) => {
                    // Allow Thai characters, English letters, numbers, and spaces
                    e.target.value = e.target.value.replace(/[^\u0E00-\u0E7Fa-zA-Z0-9\s]/g, '');
                });
            }
        });

        // Allow only alphanumeric for room ID
        const roomIdInput = document.getElementById('join-room-id');
        if (roomIdInput) {
            roomIdInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
            });
        }

        // Enter key handling
        const createNameInput = document.getElementById('create-player-name');
        const joinRoomInput = document.getElementById('join-room-id');
        
        if (createNameInput) {
            createNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const createBtn = document.getElementById('btn-confirm-create');
                    if (createBtn) createBtn.click();
                }
            });
        }

        if (joinRoomInput) {
            joinRoomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const joinBtn = document.getElementById('btn-confirm-join');
                    if (joinBtn) joinBtn.click();
                }
            });
        }
    } catch (error) {
        console.error('Error setting up input validation:', error);
    }
}

// =========================================
// Initialization (with error handling)
// =========================================

function init() {
    try {
        console.log('Initializing TwoBob Tactics Client...');
        
        // Initialize socket connection
        initSocket();
        
        // Setup all event listeners
        setupEventListeners();
        
        // Initialize controls accordion
        initControlsAccordion();
        
        // Show initial screen
        showScreen('menu-screen');
        
        console.log('TwoBob Tactics Client initialized successfully');
    } catch (error) {
        console.error('Error during initialization:', error);
        alert('เกิดข้อผิดพลาดในการเริ่มต้นเกม กรุณาโหลดหน้าใหม่');
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        init();
    } catch (error) {
        console.error('Failed to initialize on DOM loaded:', error);
    }
});

// Export functions for testing (if running in Node.js environment)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        showScreen,
        updateConnectionStatus,
        sendGameInput,
        gameState
    };
}

// Global error handler
window.addEventListener('error', (event) => {
    console.error('Global JavaScript error:', event.error);
    console.error('Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
    });
});

// Handle unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});


    
    console.log('Auto score system ready!');
});
