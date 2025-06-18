// TwoBob Tactics - Tetris Multiplayer Server with MongoDB Leaderboard
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

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

// MongoDB Configuration
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = 'tetrisgame';
let db;

// เชื่อมต่อ MongoDB
async function connectToMongoDB() {
    try {
        const client = new MongoClient(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        
        await client.connect();
        db = client.db(DB_NAME);
        console.log('✅ Connected to MongoDB successfully!');
        
        // สร้าง indexes สำหรับ performance
        await db.collection('scores').createIndex({ score: -1 });
        await db.collection('scores').createIndex({ date: -1 });
        
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        console.log('⚠️  Server will continue without MongoDB features');
    }
}

// Game Room Class
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
const playerRooms = new Map();

// Utility functions
function generateRoomId() {
    return Math.floor(10000 + Math.random() * 90000).toString();
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

// ===========================================
// MongoDB API Routes สำหรับ Leaderboard
// ===========================================

// GET - ดึงข้อมูล leaderboard
app.get('/api/leaderboard', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: 'Database not available'
            });
        }

        const limit = parseInt(req.query.limit) || 10;
        const gameMode = req.query.mode || 'all'; // 'single', 'multiplayer', 'all'
        
        let filter = {};
        if (gameMode !== 'all') {
            filter.gameMode = gameMode;
        }
        
        const leaderboard = await db.collection('scores')
            .find(filter)
            .sort({ score: -1, date: -1 })
            .limit(limit)
            .toArray();
        
        // เพิ่มอันดับให้กับข้อมูล
        const rankedLeaderboard = leaderboard.map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));
        
        res.json({
            success: true,
            data: rankedLeaderboard,
            total: rankedLeaderboard.length
        });
        
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถดึงข้อมูลอันดับได้',
            error: error.message
        });
    }
});

// POST - บันทึกคะแนนใหม่
app.post('/api/scores', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: 'Database not available'
            });
        }

        const { playerName, score, lines, level, gameMode } = req.body;
        
        // Validation
        if (!playerName || score === undefined || !gameMode) {
            return res.status(400).json({
                success: false,
                message: 'ข้อมูลไม่ครบถ้วน (playerName, score, gameMode จำเป็น)'
            });
        }
        
        if (score < 0 || lines < 0 || level < 1) {
            return res.status(400).json({
                success: false,
                message: 'ข้อมูลไม่ถูกต้อง'
            });
        }
        
        if (playerName.length > 20) {
            return res.status(400).json({
                success: false,
                message: 'ชื่อผู้เล่นยาวเกิน 20 ตัวอักษร'
            });
        }
        
        // สร้าง score document
        const scoreDocument = {
            playerName: playerName.trim(),
            score: parseInt(score),
            lines: parseInt(lines) || 0,
            level: parseInt(level) || 1,
            gameMode: gameMode,
            date: new Date(),
            createdAt: new Date()
        };
        
        // บันทึกลง database
        const result = await db.collection('scores').insertOne(scoreDocument);
        
        // ตรวจสอบว่าเป็น high score ไหม
        const topScores = await db.collection('scores')
            .find({ gameMode: gameMode })
            .sort({ score: -1 })
            .limit(10)
            .toArray();
        
        const isHighScore = topScores.some(entry => 
            entry._id.toString() === result.insertedId.toString()
        );
        
        res.status(201).json({
            success: true,
            message: 'บันทึกคะแนนสำเร็จ!',
            data: {
                id: result.insertedId,
                isHighScore: isHighScore,
                rank: isHighScore ? topScores.findIndex(entry => 
                    entry._id.toString() === result.insertedId.toString()
                ) + 1 : null
            }
        });
        
    } catch (error) {
        console.error('Error saving score:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถบันทึกคะแนนได้',
            error: error.message
        });
    }
});

// GET - ดึงข้อมูลสถิติผู้เล่น
app.get('/api/player/:playerName/stats', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: 'Database not available'
            });
        }

        const { playerName } = req.params;
        
        const stats = await db.collection('scores').aggregate([
            { $match: { playerName: playerName } },
            {
                $group: {
                    _id: '$playerName',
                    totalGames: { $sum: 1 },
                    highestScore: { $max: '$score' },
                    averageScore: { $avg: '$score' },
                    totalLines: { $sum: '$lines' },
                    lastPlayed: { $max: '$date' }
                }
            }
        ]).toArray();
        
        if (stats.length === 0) {
            return res.json({
                success: true,
                data: null,
                message: 'ไม่พบข้อมูลผู้เล่น'
            });
        }
        
        res.json({
            success: true,
            data: stats[0]
        });
        
    } catch (error) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถดึงข้อมูลสถิติได้',
            error: error.message
        });
    }
});

// DELETE - ลบข้อมูลคะแนน (สำหรับ admin)
app.delete('/api/scores/:id', async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: 'Database not available'
            });
        }

        const { id } = req.params;
        
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'ID ไม่ถูกต้อง'
            });
        }
        
        const result = await db.collection('scores').deleteOne({
            _id: new ObjectId(id)
        });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'ไม่พบข้อมูลที่ต้องการลบ'
            });
        }
        
        res.json({
            success: true,
            message: 'ลบข้อมูลสำเร็จ'
        });
        
    } catch (error) {
        console.error('Error deleting score:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถลบข้อมูลได้',
            error: error.message
        });
    }
});

// GET - ดึงข้อมูลสถิติทั้งหมด
app.get('/api/stats', async (req, res) => {
    try {
        const roomsData = Array.from(rooms.values()).map(room => ({
            id: room.id,
            players: room.players.length,
            gameStarted: room.gameStarted,
            createdAt: room.createdAt
        }));

        let dbStats = {
            totalGames: 0,
            totalPlayers: 0,
            highestScore: 0,
            averageScore: 0,
            totalLines: 0
        };

        // ดึงข้อมูลจาก MongoDB ถ้าเชื่อมต่อได้
        if (db) {
            try {
                const stats = await db.collection('scores').aggregate([
                    {
                        $group: {
                            _id: null,
                            totalGames: { $sum: 1 },
                            totalPlayers: { $addToSet: '$playerName' },
                            highestScore: { $max: '$score' },
                            averageScore: { $avg: '$score' },
                            totalLines: { $sum: '$lines' }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            totalGames: 1,
                            totalPlayers: { $size: '$totalPlayers' },
                            highestScore: 1,
                            averageScore: { $round: ['$averageScore', 2] },
                            totalLines: 1
                        }
                    }
                ]).toArray();
                
                if (stats.length > 0) {
                    dbStats = stats[0];
                }
            } catch (error) {
                console.error('Error fetching database stats:', error);
            }
        }
        
        res.json({
            success: true,
            data: {
                // Server stats
                server: {
                    totalRooms: rooms.size,
                    activePlayers: playerRooms.size,
                    rooms: roomsData
                },
                // Database stats
                database: dbStats,
                // Combined
                mongodbAvailable: !!db
            }
        });
        
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'ไม่สามารถดึงข้อมูลสถิติได้',
            error: error.message
        });
    }
});

// ===========================================
// Socket.IO Connection Handling
// ===========================================

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

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

    socket.on('playerReady', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) return;

            if (room.setPlayerReady(socket.id)) {
                io.to(data.roomId).emit('roomUpdate', {
                    players: room.players,
                    gameStarted: room.gameStarted
                });

                if (room.canStartGame()) {
                    room.startGame();
                    
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

    socket.on('gameUpdate', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room || !room.gameStarted) return;

            room.updatePlayerBoard(data.playerId, {
                board: data.board,
                score: data.score,
                lines: data.lines,
                level: data.level
            });

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

    socket.on('gameOver', async (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) return;

            room.setPlayerGameOver(data.playerId, data.score);
            
            // บันทึกคะแนนลง Database (ถ้าเชื่อมต่อได้)
            if (db && data.playerName && data.score !== undefined) {
                try {
                    await db.collection('scores').insertOne({
                        playerName: data.playerName,
                        score: parseInt(data.score),
                        lines: parseInt(data.lines) || 0,
                        level: parseInt(data.level) || 1,
                        gameMode: 'multiplayer',
                        roomId: data.roomId,
                        date: new Date(),
                        createdAt: new Date()
                    });
                    console.log(`Score saved for ${data.playerName}: ${data.score}`);
                } catch (error) {
                    console.error('Error saving score to database:', error);
                }
            }
            
            const gameResult = room.getWinner();
            if (gameResult) {
                io.to(data.roomId).emit('gameOver', gameResult);
                console.log(`Game ended in room: ${data.roomId}, Winner: Player ${gameResult.winner}`);
            }
        } catch (error) {
            console.error('Error handling game over:', error);
        }
    });

    socket.on('playAgain', (data) => {
        try {
            const room = rooms.get(data.roomId);
            if (!room) return;

            room.resetForNewGame();
            
            io.to(data.roomId).emit('roomUpdate', {
                players: room.players,
                gameStarted: room.gameStarted
            });

            console.log(`Room reset for new game: ${data.roomId}`);
        } catch (error) {
            console.error('Error resetting game:', error);
        }
    });

    socket.on('leaveRoom', (data) => {
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
                    io.to(roomId).emit('playerLeft');
                    
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

// ===========================================
// Static Routes
// ===========================================

// Serve main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        server: {
            rooms: rooms.size,
            players: playerRooms.size
        },
        mongodb: db ? 'connected' : 'disconnected'
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'ไม่พบหน้าที่ต้องการ'
    });
});

// ===========================================
// Server Startup
// ===========================================

async function startServer() {
    try {
        // เชื่อมต่อ MongoDB (ไม่บังคับ - server จะทำงานได้แม้ไม่มี MongoDB)
        await connectToMongoDB();
        
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => {
            console.log(`🚀 TwoBob Tactics server running on port ${PORT}`);
            console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🎮 Game server ready for multiplayer Tetris!`);
            console.log(`📊 Leaderboard API: ${db ? 'Available' : 'Unavailable (MongoDB not connected)'}`);
            console.log(`🏥 Health check: http://localhost:${PORT}/health`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

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

// Start the server
startServer();
