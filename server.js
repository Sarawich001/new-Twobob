// TwoBob Tactics - Tetris Multiplayer Server (FIXED)
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

// Serve static files จาก root directory
app.use(express.static(__dirname, {
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
        if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
        if (filePath.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html');
        }
    }
}));

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Game state management - FIXED CLASS
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

    // FIXED: getWinner method ใน class
    getWinner() {
        const player1 = this.players.find(p => p.id === 1);
        const player2 = this.players.find(p => p.id === 2);
        
        if (player1 && player2) {
            if (player1.gameOver && !player2.gameOver) {
                return { winner: 2, scores: { player1: player1.score, player2: player2.score } };
            } else if (player2.gameOver && !player1.gameOver) {
                return { winner: 1, scores: { player1: player1.score, player2: player2.score } };
            } else if (player1.gameOver && player2.gameOver) {
                const winner = player1.score >= player2.score ? 1 : 2;
                return { winner: winner, scores: { player1: player1.score, player2: player2.score } };
            }
        }
        
        return null;
    }

    // FIXED: resetForNewGame method ใน class
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
} // FIXED: เพิ่ม closing brace

// Room management
const rooms = new Map();
const playerRooms = new Map();

// Utility functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function cleanupEmptyRooms() {
    const now = Date.now();
    const ROOM_TIMEOUT = 30 * 60 * 1000;
    
    for (const [roomId, room] of rooms.entries()) {
        if (room.isEmpty() && (now - room.createdAt) > ROOM_TIMEOUT) {
            rooms.delete(roomId);
            console.log(`Cleaned up empty room: ${roomId}`);
        }
    }
}

setInterval(cleanupEmptyRooms, 5 * 60 * 1000);

// Socket.IO connection handling - FIXED EVENT NAMES
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // FIXED: เปลี่ยนจาก 'createRoom' เป็น 'create-room'
    socket.on('create-room', (data) => {
        try {
            const roomId = generateRoomId();
            const room = new GameRoom(roomId);
            
            const result = room.addPlayer(socket.id, data.playerName);
            if (result.success) {
                rooms.set(roomId, room);
                playerRooms.set(socket.id, roomId);
                socket.join(roomId);
                
                socket.emit('room-created', {
                    roomId: roomId,
                    player: { id: result.playerId, name: data.playerName }
                });

                io.to(roomId).emit('players-updated', room.players);

                console.log(`Room created: ${roomId} by ${data.playerName}`);
            } else {
                socket.emit('error', result.message);
            }
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', 'เกิดข้อผิดพลาดในการสร้างห้อง');
        }
    });

    // FIXED: เปลี่ยนจาก 'joinRoom' เป็น 'join-room'
    socket.on('join-room', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) {
                socket.emit('room-not-found');
                return;
            }

            if (room.isFull()) {
                socket.emit('room-full');
                return;
            }

            if (room.gameStarted) {
                socket.emit('error', 'เกมเริ่มแล้ว');
                return;
            }

            const result = room.addPlayer(socket.id, data.playerName);
            if (result.success) {
                playerRooms.set(socket.id, data.roomId);
                socket.join(data.roomId);
                
                socket.emit('room-joined', {
                    roomId: data.roomId,
                    player: { id: result.playerId, name: data.playerName }
                });

                io.to(data.roomId).emit('players-updated', room.players);

                console.log(`${data.playerName} joined room: ${data.roomId}`);
            } else {
                socket.emit('error', result.message);
            }
        } catch (error) {
            console.error('Error joining room:', error);
            socket.emit('error', 'เกิดข้อผิดพลาดในการเข้าร่วมห้อง');
        }
    });

    socket.on('player-ready', (data) => {
        try {
            const roomId = playerRooms.get(socket.id);
            const room = rooms.get(roomId);
            if (!room) return;

            if (room.setPlayerReady(socket.id)) {
                // ส่งข้อมูลสถานะ ready ของทุกคน
                const readyData = {
                    player1: room.players[0] || null,
                    player2: room.players[1] || null
                };
                
                io.to(roomId).emit('player-ready', readyData);

                if (room.canStartGame()) {
                    room.startGame();
                    
                    room.players.forEach(player => {
                        io.to(player.socketId).emit('game-start', {
                            playerId: player.id,
                            roomId: roomId,
                            players: room.players
                        });
                    });

                    console.log(`Game started in room: ${roomId}`);
                }
            }
        } catch (error) {
            console.error('Error setting player ready:', error);
        }
    });

    socket.on('game-input', (data) => {
        try {
            const roomId = playerRooms.get(socket.id);
            const room = rooms.get(roomId);
            if (!room || !room.gameStarted) return;

            // ส่งข้อมูลการเคลื่อนไหวไปยังผู้เล่นอื่น
            socket.to(roomId).emit('opponent-move', {
                action: data.action,
                playerId: socket.id
            });
        } catch (error) {
            console.error('Error handling game input:', error);
        }
    });

    socket.on('game-update', (data) => {
        try {
            const roomId = playerRooms.get(socket.id);
            const room = rooms.get(roomId);
            if (!room || !room.gameStarted) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            room.updatePlayerBoard(player.id, {
                board: data.board,
                score: data.score,
                lines: data.lines,
                level: data.level
            });

            // ส่งข้อมูลไปยังผู้เล่นทั้งหมดในห้อง
            io.to(roomId).emit('game-state', {
                boards: {
                    [player.id]: data
                },
                players: {
                    [player.id]: {
                        id: player.id,
                        name: player.name,
                        score: data.score,
                        lines: data.lines,
                        level: data.level
                    }
                }
            });
        } catch (error) {
            console.error('Error updating game:', error);
        }
    });

    socket.on('game-over', (data) => {
        try {
            const roomId = playerRooms.get(socket.id);
            const room = rooms.get(roomId);
            if (!room) return;

            const player = room.players.find(p => p.socketId === socket.id);
            if (!player) return;

            room.setPlayerGameOver(player.id, data.score);
            
            const gameResult = room.getWinner();
            if (gameResult) {
                io.to(roomId).emit('game-over', {
                    winner: gameResult.winner,
                    finalScores: gameResult.scores,
                    players: room.players.reduce((acc, p) => {
                        acc[p.id] = { id: p.id, name: p.name, score: p.score };
                        return acc;
                    }, {})
                });
                console.log(`Game ended in room: ${roomId}, Winner: Player ${gameResult.winner}`);
            }
        } catch (error) {
            console.error('Error handling game over:', error);
        }
    });

    socket.on('play-again', () => {
        try {
            const roomId = playerRooms.get(socket.id);
            const room = rooms.get(roomId);
            if (!room) return;

            room.resetForNewGame();
            
            io.to(roomId).emit('players-updated', room.players);

            console.log(`Room reset for new game: ${roomId}`);
        } catch (error) {
            console.error('Error resetting game:', error);
        }
    });

    socket.on('leave-room', () => {
        try {
            handlePlayerDisconnect(socket.id);
        } catch (error) {
            console.error('Error leaving room:', error);
        }
    });

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
                    rooms.delete(roomId);
                    console.log(`Deleted empty room: ${roomId}`);
                } else {
                    io.to(roomId).emit('players-updated', room.players);
                }
            }
            playerRooms.delete(socketId);
        }
    }
});

// Health check endpoint
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
    console.log(`TwoBob Tactics server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Game server ready for multiplayer Tetris!`);
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
