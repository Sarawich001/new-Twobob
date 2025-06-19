// TwoBob Tactics - Dashboard Management
class TwoBobDashboard {
    constructor() {
        this.apiBaseUrl = window.location.origin;
        this.refreshInterval = 30000; // 30 seconds
        this.autoRefreshTimer = null;
        this.currentView = 'leaderboard';
        
        // Bind methods
        this.refreshData = this.refreshData.bind(this);
        this.handleError = this.handleError.bind(this);
        
        // Initialize
        this.init();
    }

    async init() {
        console.log('🎮 TwoBob Tactics Dashboard initializing...');
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadAllData();
        
        // Start auto refresh
        this.startAutoRefresh();
        
        console.log('✅ Dashboard ready!');
    }

    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTab = e.target.getAttribute('data-tab');
                this.switchTab(targetTab);
            });
        });

        // Refresh buttons
        document.querySelectorAll('[data-refresh]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const refreshType = e.target.getAttribute('data-refresh');
                this.refreshData(refreshType);
            });
        });

        // Auto refresh toggle
        const autoRefreshToggle = document.getElementById('autoRefreshToggle');
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }

        // Search functionality
        const searchInput = document.getElementById('playerSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterLeaderboard(e.target.value);
            });
        }

        // Game mode filter
        const gameModeSelect = document.getElementById('gameModeFilter');
        if (gameModeSelect) {
            gameModeSelect.addEventListener('change', (e) => {
                this.loadLeaderboard(e.target.value);
            });
        }
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('[data-tab]').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Show/hide content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        document.getElementById(tabName).style.display = 'block';

        this.currentView = tabName;

        // Load data for the active tab
        this.refreshData(tabName);
    }

    async loadAllData() {
        try {
            await Promise.all([
                this.loadLeaderboard(),
                this.loadStats(),
                this.loadServerStatus()
            ]);
        } catch (error) {
            this.handleError('Failed to load dashboard data', error);
        }
    }

    async refreshData(type = 'all') {
        const refreshBtn = document.querySelector(`[data-refresh="${type}"]`);
        if (refreshBtn) {
            refreshBtn.classList.add('loading');
            refreshBtn.disabled = true;
        }

        try {
            switch (type) {
                case 'leaderboard':
                    await this.loadLeaderboard();
                    break;
                case 'stats':
                    await this.loadStats();
                    break;
                case 'server':
                    await this.loadServerStatus();
                    break;
                case 'all':
                default:
                    await this.loadAllData();
                    break;
            }
            
            this.updateLastRefreshTime();
        } catch (error) {
            this.handleError(`Failed to refresh ${type}`, error);
        } finally {
            if (refreshBtn) {
                refreshBtn.classList.remove('loading');
                refreshBtn.disabled = false;
            }
        }
    }

    async loadLeaderboard(gameMode = 'all', limit = 50) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/leaderboard?mode=${gameMode}&limit=${limit}`);
            const data = await response.json();

            if (data.success) {
                this.renderLeaderboard(data.data);
            } else {
                throw new Error(data.message || 'Failed to load leaderboard');
            }
        } catch (error) {
            this.handleError('Failed to load leaderboard', error);
            this.renderLeaderboard([]);
        }
    }

    renderLeaderboard(scores) {
        const tbody = document.getElementById('leaderboardBody');
        if (!tbody) return;

        if (scores.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        <i class="fas fa-info-circle"></i> ไม่มีข้อมูลคะแนน
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = scores.map(score => {
            const date = new Date(score.date).toLocaleString('th-TH');
            const gameMode = score.gameMode === 'single' ? 'เดี่ยว' : 'แบบคู่';
            const rankIcon = this.getRankIcon(score.rank);
            
            return `
                <tr class="rank-${score.rank <= 3 ? score.rank : 'other'}">
                    <td>
                        <span class="rank-badge rank-${score.rank <= 3 ? score.rank : 'other'}">
                            ${rankIcon} ${score.rank}
                        </span>
                    </td>
                    <td>
                        <strong class="player-name">${this.escapeHtml(score.playerName)}</strong>
                    </td>
                    <td class="score-cell">
                        <span class="score-value">${score.score.toLocaleString()}</span>
                    </td>
                    <td>${score.lines || 0}</td>
                    <td>${score.level || 1}</td>
                    <td>
                        <span class="badge badge-${score.gameMode === 'single' ? 'primary' : 'success'}">
                            ${gameMode}
                        </span>
                    </td>
                    <td class="text-muted">${date}</td>
                </tr>
            `;
        }).join('');

        // Update leaderboard stats
        this.updateLeaderboardStats(scores);
    }

    getRankIcon(rank) {
        switch (rank) {
            case 1: return '🥇';
            case 2: return '🥈';
            case 3: return '🥉';
            default: return '#';
        }
    }

    updateLeaderboardStats(scores) {
        const totalScores = scores.length;
        const highestScore = scores.length > 0 ? scores[0].score : 0;
        const averageScore = scores.length > 0 
            ? Math.round(scores.reduce((sum, s) => sum + s.score, 0) / scores.length)
            : 0;

        document.getElementById('totalScores').textContent = totalScores.toLocaleString();
        document.getElementById('highestScore').textContent = highestScore.toLocaleString();
        document.getElementById('averageScore').textContent = averageScore.toLocaleString();
    }

    async loadStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/stats`);
            const data = await response.json();

            if (data.success) {
                this.renderStats(data.data);
            } else {
                throw new Error(data.message || 'Failed to load stats');
            }
        } catch (error) {
            this.handleError('Failed to load statistics', error);
            this.renderStats({
                server: { totalRooms: 0, activePlayers: 0, rooms: [] },
                database: { totalGames: 0, totalPlayers: 0, highestScore: 0, averageScore: 0, totalLines: 0 },
                mongodbAvailable: false
            });
        }
    }

    renderStats(stats) {
        // Server Stats
        document.getElementById('totalRooms').textContent = stats.server.totalRooms;
        document.getElementById('activePlayers').textContent = stats.server.activePlayers;

        // Database Stats
        document.getElementById('totalGames').textContent = stats.database.totalGames.toLocaleString();
        document.getElementById('totalPlayersCount').textContent = stats.database.totalPlayers.toLocaleString();
        document.getElementById('globalHighScore').textContent = stats.database.highestScore.toLocaleString();
        document.getElementById('globalAvgScore').textContent = Math.round(stats.database.averageScore).toLocaleString();
        document.getElementById('totalLinesCleared').textContent = stats.database.totalLines.toLocaleString();

        // Database Status
        const dbStatus = document.getElementById('dbStatus');
        if (dbStatus) {
            dbStatus.className = `badge ${stats.mongodbAvailable ? 'badge-success' : 'badge-danger'}`;
            dbStatus.textContent = stats.mongodbAvailable ? 'เชื่อมต่อแล้ว' : 'ไม่เชื่อมต่อ';
        }

        // Render active rooms
        this.renderActiveRooms(stats.server.rooms);
    }

    renderActiveRooms(rooms) {
        const tbody = document.getElementById('activeRoomsBody');
        if (!tbody) return;

        if (rooms.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted">
                        <i class="fas fa-info-circle"></i> ไม่มีห้องที่ใช้งานอยู่
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = rooms.map(room => {
            const createdAt = new Date(room.createdAt).toLocaleString('th-TH');
            const statusClass = room.gameStarted ? 'success' : 'warning';
            const statusText = room.gameStarted ? 'กำลังเล่น' : 'รอผู้เล่น';
            
            return `
                <tr>
                    <td><code>${room.id}</code></td>
                    <td>${room.players}/2</td>
                    <td>
                        <span class="badge badge-${statusClass}">${statusText}</span>
                    </td>
                    <td class="text-muted">${createdAt}</td>
                </tr>
            `;
        }).join('');
    }

    async loadServerStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/health`);
            const data = await response.json();

            this.renderServerStatus(data);
        } catch (error) {
            this.handleError('Failed to load server status', error);
            this.renderServerStatus({
                status: 'ERROR',
                timestamp: new Date().toISOString(),
                server: { rooms: 0, players: 0 },
                mongodb: 'disconnected'
            });
        }
    }

    renderServerStatus(status) {
        // Server Status
        const serverStatus = document.getElementById('serverStatus');
        if (serverStatus) {
            serverStatus.className = `badge ${status.status === 'OK' ? 'badge-success' : 'badge-danger'}`;
            serverStatus.textContent = status.status === 'OK' ? 'ออนไลน์' : 'ออฟไลน์';
        }

        // Last Check
        const lastCheck = document.getElementById('lastHealthCheck');
        if (lastCheck) {
            lastCheck.textContent = new Date(status.timestamp).toLocaleString('th-TH');
        }

        // MongoDB Status
        const mongoStatus = document.getElementById('mongoStatus');
        if (mongoStatus) {
            mongoStatus.className = `badge ${status.mongodb === 'connected' ? 'badge-success' : 'badge-danger'}`;
            mongoStatus.textContent = status.mongodb === 'connected' ? 'เชื่อมต่อ' : 'ไม่เชื่อมต่อ';
        }

        // System Info
        document.getElementById('systemRooms').textContent = status.server.rooms;
        document.getElementById('systemPlayers').textContent = status.server.players;
    }

    filterLeaderboard(searchTerm) {
        const rows = document.querySelectorAll('#leaderboardBody tr');
        const term = searchTerm.toLowerCase();

        rows.forEach(row => {
            const playerName = row.querySelector('.player-name');
            if (playerName) {
                const name = playerName.textContent.toLowerCase();
                row.style.display = name.includes(term) ? '' : 'none';
            }
        });
    }

    startAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
        }

        this.autoRefreshTimer = setInterval(() => {
            this.refreshData(this.currentView);
        }, this.refreshInterval);

        console.log('Auto refresh started');
    }

    stopAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }

        console.log('Auto refresh stopped');
    }

    updateLastRefreshTime() {
        const lastRefresh = document.getElementById('lastRefresh');
        if (lastRefresh) {
            lastRefresh.textContent = new Date().toLocaleString('th-TH');
        }
    }

    handleError(message, error) {
        console.error(message, error);
        
        // Show error notification
        this.showNotification(message, 'error');
        
        // Update error display
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) {
            errorDisplay.innerHTML = `
                <div class="alert alert-danger" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>เกิดข้อผิดพลาด:</strong> ${message}
                    <br><small>${error.message || 'Unknown error'}</small>
                </div>
            `;
            setTimeout(() => {
                errorDisplay.innerHTML = '';
            }, 10000);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : 'info'} notification`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            ${message}
            <button type="button" class="close" onclick="this.parentElement.remove()">
                <span>&times;</span>
            </button>
        `;

        // Add to page
        const container = document.getElementById('notificationContainer') || document.body;
        container.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Utility method to export leaderboard data
    exportLeaderboard() {
        const rows = document.querySelectorAll('#leaderboardBody tr');
        const data = [];
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 7) {
                data.push({
                    rank: cells[0].textContent.trim(),
                    playerName: cells[1].textContent.trim(),
                    score: cells[2].textContent.trim(),
                    lines: cells[3].textContent.trim(),
                    level: cells[4].textContent.trim(),
                    gameMode: cells[5].textContent.trim(),
                    date: cells[6].textContent.trim()
                });
            }
        });

        // Convert to CSV
        const csv = [
            'Rank,Player Name,Score,Lines,Level,Game Mode,Date',
            ...data.map(row => Object.values(row).map(val => `"${val}"`).join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `twobob-leaderboard-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // Method to clear all data (admin function)
    async clearLeaderboard() {
        if (!confirm('คุณแน่ใจหรือไม่ที่จะลบข้อมูลคะแนนทั้งหมด? การดำเนินการนี้ไม่สามารถยกเลิกได้!')) {
            return;
        }

        try {
            // This would require an admin endpoint on the server
            // For now, just show a message
            this.showNotification('ฟีเจอร์นี้ต้องการสิทธิ์ผู้ดูแลระบบ', 'error');
        } catch (error) {
            this.handleError('Failed to clear leaderboard', error);
        }
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.twoBobDashboard = new TwoBobDashboard();
});

// Export for global access
window.TwoBobDashboard = TwoBobDashboard;
