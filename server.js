// TwoBob Tactics - Tetris Multiplayer Server
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state management
class GameRoom {
    constructor(id) {
        this.id = id;
        this.players = [];
        this.gameStarted = false;
        this.gameState = {
            player1: { board: [], score: 0, lines: 0, level: 1, gameOver: false },
            player2: { board: [], score: 0, lines: 0, level: 1, gameOver: false }
        };
        this.readyCount = 0;
        this.createdAt = Date.now();
    }

    addPlayer(socketId, playerName) {
        if (this.players.length >= 2) {
            return { success: false, message: 'ห้องเต็มแล้ว' };
        }

        const playerId = this.players.length + 1;
        const player = {
            id: playerId,
            socketId: socketId,
            name: playerName,
            ready: false,
            score: 0,
            gameOver: false
        };

        this.players.push(player);
        return { success: true, playerId: playerId };
    }

    removePlayer(socketId) {
        const playerIndex = this.players.findIndex(p => p.socketId === socketId);
        if (playerIndex !== -1) {
            this.players.splice(playerIndex, 1);
            this.readyCount = Math.max(0, this.readyCount - 1);
            return true;
        }
        return false;
    }

    setPlayerReady(socketId) {
        const player = this.players.find(p => p.socketId === socketId);
        if (player && !player.ready) {
            player.ready = true;
            this.readyCount++;
            return true;
        }
        return false;
    }

    canStartGame() {
        return this.players.length === 2 && this.readyCount === 2 && !this.gameStarted;
    }

    startGame() {
        if (this.canStartGame()) {
            this.gameStarted = true;
            this.resetGameState();
            return true;
        }
        return false;
    }

    resetGameState() {
        this.gameState = {
            player1: { board: this.createEmptyBoard(), score: 0, lines: 0, level: 1, gameOver: false },
            player2: { board: this.createEmptyBoard(), score: 0, lines: 0, level: 1, gameOver: false }
        };
        this.players.forEach(player => {
            player.score = 0;
            player.gameOver = false;
        });
    }

    createEmptyBoard() {
        return Array(20).fill().map(() => Array(10).fill(0));
    }

    updatePlayerBoard(playerId, boardData) {
        if (playerId === 1) {
            this.gameState.player1 = { ...this.gameState.player1, ...boardData };
        } else if (playerId === 2) {
            this.gameState.player2 = { ...this.gameState.player2, ...boardData };
        }
    }

    setPlayerGameOver(playerId, score) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.gameOver = true;
            player.score = score;
            
            if (playerId === 1) {
                this.gameState.player1.gameOver = true;
            } else if (playerId === 2) {
                this.gameState.player2.gameOver = true;
            }
        }
    }

    getWinner() {
        const player1 = this.players.find(p => p.id === 1);
        const player2 = this.players.find(p => p.id === 2);
        
        if (player1 && player2) {
            if (player1.gameOver && !player2.gameOver) {
                return { winner: 2, scores: { player1: player1.score, player2: player2.score } };
            } else if (player2.gameOver && !player1.gameOver) {
                return { winner: 1, scores: { player1: player1.score, player2: player2.score } };
            } else if (player1.gameOver && player2.gameOver) {
                // Both game over, winner by score
                const winner = player1.score >= player2.score ? 1 : 2;
                return { winner: winner, scores: { player1: player1.score, player2: player2.score } };
            }
        }
        
        return null;
    }

    resetForNewGame() {
        this.gameStarted = false;
        this.readyCount = 0;
        this.players.forEach(player => {
            player.ready = false;
            player.gameOver = false;
            player.score = 0;
        });
        this.resetGameState();
    }

    isEmpty() {
        return this.players.length === 0;
    }

    isFull() {
        return this.players.length >= 2;
    }
}

// Room management
const rooms = new Map();
const playerRooms = new Map(); // socketId -> roomId

// Utility functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function cleanupEmptyRooms() {
    const now = Date.now();
    const ROOM_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    
    for (const [roomId, room] of rooms.entries()) {
        if (room.isEmpty() && (now - room.createdAt) > ROOM_TIMEOUT) {
            rooms.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
        }
    }
}

// Clean up empty rooms every 5 minutes
setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create room
    socket.on('createRoom', (data) => {
        try {
            const roomId = generateRoomId();
            const room = new GameRoom(roomId);
            
            const result = room.addPlayer(socket.id, data.playerName);
            if (result.success) {
                rooms.set(roomId, room);
                playerRooms.set(socket.id, roomId);
                socket.join(roomId);
                
                socket.emit('roomCreated', {
                    roomId: roomId,
                    playerId: result.playerId
                });

                // Send room update
                io.to(roomId).emit('roomUpdate', {
                    players: room.players,
                    gameStarted: room.gameStarted
                });

                console.log(`Room created: ${roomId} by ${data.playerName}`);
            } else {
                socket.emit('roomError', { message: result.message });
            }
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('roomError', { message: 'เกิดข้อผิดพลาดในการสร้างห้อง' });
        }
    });

    // Join room
    socket.on('joinRoom', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) {
                socket.emit('roomError', { message: 'ไม่พบห้องที่ระบุ' });
                return;
            }

            if (room.isFull()) {
                socket.emit('roomError', { message: 'ห้องเต็มแล้ว' });
                return;
            }

            if (room.gameStarted) {
                socket.emit('roomError', { message: 'เกมเริ่มแล้ว' });
                return;
            }

            const result = room.addPlayer(socket.id, data.playerName);
            if (result.success) {
                playerRooms.set(socket.id, data.roomId);
                socket.join(data.roomId);
                
                socket.emit('roomJoined', {
                    roomId: data.roomId,
                    playerId: result.playerId
                });

                // Send room update to all players
                io.to(data.roomId).emit('roomUpdate', {
                    players: room.players,
                    gameStarted: room.gameStarted
                });

                console.log(`${data.playerName} joined room: ${data.roomId}`);
            } else {
                socket.emit('roomError', { message: result.message });
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('roomError', { message: 'เกิดข้อผิดพลาดในการเข้าร่วมห้อง' });
        }
    });

    // Player ready
    socket.on('playerReady', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) return;

            if (room.setPlayerReady(socket.id)) {
                // Send updated room status
                io.to(data.roomId).emit('roomUpdate', {
                    players: room.players,
                    gameStarted: room.gameStarted
                });

                // Start game if both players are ready
                if (room.canStartGame()) {
                    room.startGame();
                    
                    // Send game start event to all players
                    room.players.forEach(player => {
                        io.to(player.socketId).emit('gameStart', {
                            playerId: player.id,
                            roomId: data.roomId
                        });
                    });

                    console.log(`Game started in room: ${data.roomId}`);
                }
            }
        } catch (error) {
            console.error('Error setting player ready:', error);
        }
    });

    // Game update
    socket.on('gameUpdate', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room || !room.gameStarted) return;

            // Update room game state
            room.updatePlayerBoard(data.playerId, {
                board: data.board,
                score: data.score,
                lines: data.lines,
                level: data.level
            });

            // Send update to opponent
            const opponent = room.players.find(p => p.id !== data.playerId);
            if (opponent) {
                io.to(opponent.socketId).emit('gameUpdate', {
                    playerId: data.playerId,
                    board: data.board,
                    score: data.score,
                    lines: data.lines,
                    level: data.level
                });
            }
        } catch (error) {
            console.error('Error updating game:', error);
        }
    });

    // Game over
    socket.on('gameOver', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) return;

            room.setPlayerGameOver(data.playerId, data.score);
            
            // Check if game should end
            const gameResult = room.getWinner();
            if (gameResult) {
                // Send game over to all players
                io.to(data.roomId).emit('gameOver', gameResult);
                console.log(`Game ended in room: ${data.roomId}, Winner: Player ${gameResult.winner}`);
            }
        } catch (error) {
            console.error('Error handling game over:', error);
        }
    });

    // Play again
    socket.on('playAgain', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) return;

            room.resetForNewGame();
            
            // Send room update
            io.to(data.roomId).emit('roomUpdate', {
                players: room.players,
                gameStarted: room.gameStarted
            });

            console.log(`Room reset for new game: ${data.roomId}`);
        } catch (error) {
            console.error('Error resetting game:', error);
        }
    });

    // Leave room
    socket.on('leaveRoom', (data) => {
        try {
            handlePlayerDisconnect(socket.id);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        handlePlayerDisconnect(socket.id);
    });

    function handlePlayerDisconnect(socketId) {
        const roomId = playerRooms.get(socketId);
        if (roomId) {
            const room = rooms.get(roomId);
            if (room) {
                room.removePlayer(socketId);
                
                if (room.isEmpty()) {
                    // Delete empty room immediately
                    rooms.delete(roomId);
                    console.log(`Deleted empty room: ${roomId}`);
                } else {
                    // Notify remaining players
                    io.to(roomId).emit('playerLeft');
                    
                    // Update room status
                    io.to(roomId).emit('roomUpdate', {
                        players: room.players,
                        gameStarted: room.gameStarted
                    });
                }
            }
            playerRooms.delete(socketId);
        }
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        players: playerRooms.size
    });
});

// API endpoint to get server stats
app.get('/api/stats', (req, res) => {
    const roomsData = Array.from(rooms.values()).map(room => ({
        id: room.id,
        players: room.players.length,
        gameStarted: room.gameStarted,
        createdAt: room.createdAt
    }));

    res.json({
        totalRooms: rooms.size,
        totalPlayers: playerRooms.size,
        rooms: roomsData
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 TwoBob Tactics server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🎮 Game server ready for multiplayer Tetris!`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
