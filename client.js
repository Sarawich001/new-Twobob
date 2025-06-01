// TwoBob Tactics - Tetris Multiplayer Client (Fixed Play Again)
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
            this.resetToWaitingScreen();
        });

        // เพิ่ม event สำหรับ play again
        this.socket.on('playAgainResponse', (data) => {
            if (data.success) {
                this.resetForNewGame();
                this.showWaitingScreen();
            } else {
                alert(data.message || 'ไม่สามารถเล่นใหม่ได้');
            }
        });

        this.socket.on('bothPlayersReady', () => {
            // ผู้เล่นทั้งคู่พร้อมแล้ว เกมจะเริ่มใหม่
            console.log('Both players ready for new game');
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

        // Play again - ปรับปรุงใหม่
        document.getElementById('btn-play-again').addEventListener('click', () => {
            this.handlePlayAgain();
        });

        // Back to menu from game over screen
        document.getElementById('btn-back-menu').addEventListener('click', () => {
            this.socket.emit('leaveRoom', { roomId: this.roomId });
            this.resetGame();
            this.showScreen('menu-screen');
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
        
        // รีเซ็ต opponent state
        this.opponentState.score = 0;
        this.opponentState.lines = 0;
        this.opponentState.level = 1;
        this.opponentState.gameOver = false;
        
        this.showScreen('game-screen');
        this.setupGameLayout();
        this.updateBoard();
        this.updateStats();
        this.updateOpponentStats();
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
        this.isReady = false;
        
        // Clear ready status display
        this.clearReadyStatus();
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

    clearReadyStatus() {
        // Clear ready indicators
        for (let i = 1; i <= 2; i++) {
            const indicator = document.getElementById(`ready-indicator-${i}`);
            if (indicator) {
                indicator.textContent = '';
            }
        }
    }

    // ฟังก์ชันจัดการ Play Again ที่ปรับปรุงแล้ว
    handlePlayAgain() {
        // Disable button to prevent multiple clicks
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            playAgainBtn.disabled = true;
            playAgainBtn.textContent = 'กำลังเตรียมเกมใหม่...';
        }
        
        // Send play again request to server
        this.socket.emit('playAgain', { 
            roomId: this.roomId,
            playerId: this.playerId
        });
    }

    // รีเซ็ตเกมสำหรับเกมใหม่
    resetForNewGame() {
        this.gameStarted = false;
        this.isReady = false;
        
        // Reset game states
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
        
        // Reset timing
        this.lastMoveTime = 0;
        this.moveInterval = 500;
        
        // Initialize boards
        this.initializeBoard();
        
        // Reset play again button
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            playAgainBtn.disabled = false;
            playAgainBtn.textContent = '🔄 เล่นอีกครั้ง';
        }
    }

    // รีเซ็ตกลับไปหน้ารอ
    resetToWaitingScreen() {
        this.resetForNewGame();
        this.showWaitingScreen();
    }

    // รีเซ็ตเกมทั้งหมด
    resetGame() {
        this.gameStarted = false;
        this.isReady = false;
        this.roomId = null;
        this.playerId = null;
        this.playerName = '';
        this.opponentName = '';
        
        this.resetForNewGame();
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
        
        // Reset play again button state
        const playAgainBtn = document.getElementById('btn-play-again');
        if (playAgainBtn) {
            playAgainBtn.disabled = false;
            playAgainBtn.textContent = '🔄 เล่นอีกครั้ง';
        }
        
        this.showScreen('game-over-screen');
    }
}

// Initialize game when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.tetrisGame = new TetrisMultiplayer();
});
