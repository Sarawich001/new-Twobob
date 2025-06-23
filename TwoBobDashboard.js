// TwoBob Tactics - Enhanced Dashboard with MongoDB Integration
class TwoBobDashboard {
    constructor() {
        this.apiBaseUrl = window.location.origin;
        this.refreshInterval = 30000; // 30 seconds
        this.autoRefreshTimer = null;
        this.currentView = 'leaderboard';
        this.currentGameMode = 'all';
        this.currentLimit = 50;
        
        // Bind methods
        this.refreshData = this.refreshData.bind(this);
        this.handleError = this.handleError.bind(this);
        
        // Initialize
        this.init();
    }

    async init() {
        console.log('🎮 TwoBob Tactics Dashboard initializing...');
        
        // Check MongoDB connection first
        await this.checkDatabaseConnection();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadAllData();
        
        // Start auto refresh
        this.startAutoRefresh();
        
        console.log('✅ Dashboard ready!');
    }

    async checkDatabaseConnection() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/health`);
            const data = await response.json();
            
            if (!data.mongodb || data.mongodb !== 'connected') {
                this.showNotification('⚠️ MongoDB ไม่เชื่อมต่อ - ข้อมูลอาจไม่ครบถ้วน', 'warning');
            }
        } catch (error) {
            console.warn('Could not check database connection:', error);
        }
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
                this.currentGameMode = e.target.value;
                this.loadLeaderboard(this.currentGameMode, this.currentLimit);
            });
        }

        // Limit selector
        const limitSelect = document.getElementById('limitSelect');
        if (limitSelect) {
            limitSelect.addEventListener('change', (e) => {
                this.currentLimit = parseInt(e.target.value);
                this.loadLeaderboard(this.currentGameMode, this.currentLimit);
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                this.exportLeaderboard();
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
            const startTime = performance.now();
            
            await Promise.all([
                this.loadLeaderboard(this.currentGameMode, this.currentLimit),
                this.loadStats(),
                this.loadServerStatus(),
                this.loadPlayerStats()
            ]);
            
            const loadTime = Math.round(performance.now() - startTime);
            console.log(`✅ All data loaded in ${loadTime}ms`);
            
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
                    await this.loadLeaderboard(this.currentGameMode, this.currentLimit);
                    break;
                case 'stats':
                    await this.loadStats();
                    break;
                case 'server':
                    await this.loadServerStatus();
                    break;
                case 'players':
                    await this.loadPlayerStats();
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
            // Show loading state
            const tbody = document.getElementById('leaderboardBody');
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center">
                            <i class="fas fa-spinner fa-spin"></i> กำลังโหลดข้อมูล...
                        </td>
                    </tr>
                `;
            }

            const response = await fetch(`${this.apiBaseUrl}/api/leaderboard?mode=${gameMode}&limit=${limit}&sort=score&order=desc`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();

            if (data.success && data.data) {
                console.log(`📊 Loaded ${data.data.length} scores from MongoDB`);
                this.renderLeaderboard(data.data);
                
                // Update metadata if available
                if (data.metadata) {
                    this.updateLeaderboardMetadata(data.metadata);
                }
            } else {
                throw new Error(data.message || 'Failed to load leaderboard data');
            }
        } catch (error) {
            console.error('Leaderboard loading error:', error);
            this.handleError('ไม่สามารถโหลดข้อมูลคะแนนได้', error);
            this.renderLeaderboard([]);
        }
    }

    renderLeaderboard(scores) {
        const tbody = document.getElementById('leaderboardBody');
        if (!tbody) return;

        if (!scores || scores.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">
                        <i class="fas fa-info-circle"></i> ไม่มีข้อมูลคะแนน
                        <br><small>ลองเปลี่ยนโหมดเกมหรือตรวจสอบการเชื่อมต่อฐานข้อมูล</small>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = scores.map((score, index) => {
            // Handle different date formats from MongoDB
            let date = 'ไม่ระบุ';
            if (score.createdAt) {
                date = new Date(score.createdAt).toLocaleString('th-TH');
            } else if (score.date) {
                date = new Date(score.date).toLocaleString('th-TH');
            } else if (score.timestamp) {
                date = new Date(score.timestamp).toLocaleString('th-TH');
            }
            
            const gameMode = score.gameMode === 'single' ? 'เดี่ยว' : 'แบบคู่';
            const rank = index + 1; // Calculate rank based on position
            const rankIcon = this.getRankIcon(rank);
            
            // Handle player name safely
            const playerName = score.playerName || score.player || 'Unknown Player';
            
            return `
                <tr class="rank-${rank <= 3 ? rank : 'other'}" data-player="${this.escapeHtml(playerName)}">
                    <td>
                        <span class="rank-badge rank-${rank <= 3 ? rank : 'other'}">
                            ${rankIcon} ${rank}
                        </span>
                    </td>
                    <td>
                        <strong class="player-name" title="${this.escapeHtml(playerName)}">
                            ${this.escapeHtml(playerName)}
                        </strong>
                        ${score._id ? `<br><small class="text-muted">ID: ${score._id.toString().slice(-6)}</small>` : ''}
                    </td>
                    <td class="score-cell">
                        <span class="score-value" title="${score.score} คะแนน">
                            ${(score.score || 0).toLocaleString('th-TH')}
                        </span>
                    </td>
                    <td title="${score.lines || 0} บรรทัด">${(score.lines || 0).toLocaleString('th-TH')}</td>
                    <td title="เลเวล ${score.level || 1}">${score.level || 1}</td>
                    <td>
                        <span class="badge badge-${score.gameMode === 'single' ? 'primary' : 'success'}">
                            ${gameMode}
                        </span>
                    </td>
                    <td class="text-muted" title="${date}">${date}</td>
                </tr>
            `;
        }).join('');

        // Update leaderboard stats
        this.updateLeaderboardStats(scores);
        
        // Update total count display
        const totalDisplay = document.getElementById('totalScoresDisplay');
        if (totalDisplay) {
            totalDisplay.textContent = `แสดง ${scores.length} รายการ`;
        }
    }

    updateLeaderboardMetadata(metadata) {
        if (metadata.totalCount) {
            const totalDisplay = document.getElementById('totalCountDisplay');
            if (totalDisplay) {
                totalDisplay.textContent = `ทั้งหมด ${metadata.totalCount.toLocaleString('th-TH')} คะแนน`;
            }
        }
        
        if (metadata.lastUpdated) {
            const lastUpdated = document.getElementById('lastDataUpdate');
            if (lastUpdated) {
                lastUpdated.textContent = new Date(metadata.lastUpdated).toLocaleString('th-TH');
            }
        }
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
        if (!scores || scores.length === 0) {
            document.getElementById('totalScores').textContent = '0';
            document.getElementById('highestScore').textContent = '0';
            document.getElementById('averageScore').textContent = '0';
            return;
        }

        const totalScores = scores.length;
        const highestScore = Math.max(...scores.map(s => s.score || 0));
        const averageScore = Math.round(
            scores.reduce((sum, s) => sum + (s.score || 0), 0) / scores.length
        );

        document.getElementById('totalScores').textContent = totalScores.toLocaleString('th-TH');
        document.getElementById('highestScore').textContent = highestScore.toLocaleString('th-TH');
        document.getElementById('averageScore').textContent = averageScore.toLocaleString('th-TH');
    }

    async loadStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/stats`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();

            if (data.success && data.data) {
                console.log('📈 Stats loaded from MongoDB');
                this.renderStats(data.data);
            } else {
                throw new Error(data.message || 'Failed to load statistics');
            }
        } catch (error) {
            console.error('Stats loading error:', error);
            this.handleError('ไม่สามารถโหลดสถิติได้', error);
            this.renderStats({
                server: { totalRooms: 0, activePlayers: 0, rooms: [] },
                database: { 
                    totalGames: 0, 
                    totalPlayers: 0, 
                    highestScore: 0, 
                    averageScore: 0, 
                    totalLines: 0,
                    available: false
                }
            });
        }
    }

    renderStats(stats) {
        // Server Stats
        if (stats.server) {
            document.getElementById('totalRooms').textContent = (stats.server.totalRooms || 0).toLocaleString('th-TH');
            document.getElementById('activePlayers').textContent = (stats.server.activePlayers || 0).toLocaleString('th-TH');
            
            // Render active rooms
            if (stats.server.rooms) {
                this.renderActiveRooms(stats.server.rooms);
            }
        }

        // Database Stats from MongoDB
        if (stats.database) {
            const db = stats.database;
            document.getElementById('totalGames').textContent = (db.totalGames || 0).toLocaleString('th-TH');
            document.getElementById('totalPlayersCount').textContent = (db.totalPlayers || 0).toLocaleString('th-TH');
            document.getElementById('globalHighScore').textContent = (db.highestScore || 0).toLocaleString('th-TH');
            document.getElementById('globalAvgScore').textContent = Math.round(db.averageScore || 0).toLocaleString('th-TH');
            document.getElementById('totalLinesCleared').textContent = (db.totalLines || 0).toLocaleString('th-TH');
        }

        // Database Status
        const dbStatus = document.getElementById('dbStatus');
        if (dbStatus) {
            const isConnected = stats.mongodbAvailable || stats.database?.available;
            dbStatus.className = `badge ${isConnected ? 'badge-success' : 'badge-danger'}`;
            dbStatus.textContent = isConnected ? 'เชื่อมต่อแล้ว' : 'ไม่เชื่อมต่อ';
        }

        // Update connection quality indicator
        this.updateConnectionQuality(stats);
    }

    updateConnectionQuality(stats) {
        const indicator = document.getElementById('connectionQuality');
        if (!indicator) return;

        const isServerOk = stats.server && stats.server.totalRooms !== undefined;
        const isDbOk = stats.mongodbAvailable || stats.database?.available;
        
        let quality = 'good';
        let text = 'ดี';
        let icon = 'fas fa-check-circle';
        
        if (!isServerOk && !isDbOk) {
            quality = 'poor';
            text = 'มีปัญหา';
            icon = 'fas fa-exclamation-circle';
        } else if (!isDbOk) {
            quality = 'fair';
            text = 'ปานกลาง';
            icon = 'fas fa-exclamation-triangle';
        }
        
        indicator.className = `connection-quality ${quality}`;
        indicator.innerHTML = `<i class="${icon}"></i> ${text}`;
    }

    async loadPlayerStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/players/stats`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();

            if (data.success && data.data) {
                this.renderPlayerStats(data.data);
            }
        } catch (error) {
            console.error('Player stats loading error:', error);
            // Don't show error for optional stats
        }
    }

    renderPlayerStats(playerStats) {
        if (!playerStats) return;

        // Top players this week/month
        if (playerStats.topThisWeek) {
            this.renderTopPlayers('thisWeek', playerStats.topThisWeek);
        }
        
        if (playerStats.topThisMonth) {
            this.renderTopPlayers('thisMonth', playerStats.topThisMonth);
        }

        // Game mode distribution
        if (playerStats.gameModeStats) {
            this.renderGameModeChart(playerStats.gameModeStats);
        }
    }

    renderTopPlayers(period, players) {
        const container = document.getElementById(`topPlayers${period.charAt(0).toUpperCase() + period.slice(1)}`);
        if (!container || !players || players.length === 0) return;

        container.innerHTML = players.map(player => `
            <div class="top-player-item">
                <span class="player-name">${this.escapeHtml(player.playerName)}</span>
                <span class="player-score">${player.score.toLocaleString('th-TH')}</span>
            </div>
        `).join('');
    }

    renderActiveRooms(rooms) {
        const tbody = document.getElementById('activeRoomsBody');
        if (!tbody) return;

        if (!rooms || rooms.length === 0) {
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
            const createdAt = room.createdAt ? 
                new Date(room.createdAt).toLocaleString('th-TH') : 
                'ไม่ระบุ';
            const statusClass = room.gameStarted ? 'success' : 'warning';
            const statusText = room.gameStarted ? 'กำลังเล่น' : 'รอผู้เล่น';
            
            return `
                <tr>
                    <td><code title="Room ID">${room.id}</code></td>
                    <td>
                        <span class="badge badge-secondary">
                            ${room.players || 0}/2
                        </span>
                    </td>
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
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.renderServerStatus(data);
            
        } catch (error) {
            console.error('Server status loading error:', error);
            this.renderServerStatus({
                status: 'ERROR',
                timestamp: new Date().toISOString(),
                server: { rooms: 0, players: 0 },
                mongodb: 'disconnected',
                error: error.message
            });
        }
    }

    renderServerStatus(status) {
        // Server Status
        const serverStatus = document.getElementById('serverStatus');
        if (serverStatus) {
            const isOnline = status.status === 'OK';
            serverStatus.className = `badge ${isOnline ? 'badge-success' : 'badge-danger'}`;
            serverStatus.textContent = isOnline ? 'ออนไลน์' : 'ออฟไลน์';
        }

        // Last Check
        const lastCheck = document.getElementById('lastHealthCheck');
        if (lastCheck) {
            lastCheck.textContent = new Date(status.timestamp).toLocaleString('th-TH');
        }

        // MongoDB Status
        const mongoStatus = document.getElementById('mongoStatus');
        if (mongoStatus) {
            const isConnected = status.mongodb === 'connected';
            mongoStatus.className = `badge ${isConnected ? 'badge-success' : 'badge-danger'}`;
            mongoStatus.textContent = isConnected ? 'เชื่อมต่อ' : 'ไม่เชื่อมต่อ';
        }

        // System Info
        if (status.server) {
            document.getElementById('systemRooms').textContent = (status.server.rooms || 0).toLocaleString('th-TH');
            document.getElementById('systemPlayers').textContent = (status.server.players || 0).toLocaleString('th-TH');
        }

        // Show error details if any
        if (status.error) {
            console.warn('Server status error:', status.error);
        }
    }

    filterLeaderboard(searchTerm) {
        const rows = document.querySelectorAll('#leaderboardBody tr');
        const term = searchTerm.toLowerCase().trim();

        let visibleCount = 0;
        rows.forEach(row => {
            const playerName = row.querySelector('.player-name');
            if (playerName) {
                const name = playerName.textContent.toLowerCase();
                const isVisible = !term || name.includes(term);
                row.style.display = isVisible ? '' : 'none';
                if (isVisible) visibleCount++;
            }
        });

        // Update search results count
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.textContent = term ? 
                `พบ ${visibleCount} รายการ` : 
                '';
        }
    }

    startAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
        }

        this.autoRefreshTimer = setInterval(() => {
            this.refreshData(this.currentView);
        }, this.refreshInterval);

        console.log('🔄 Auto refresh started');
    }

    stopAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }

        console.log('⏹️ Auto refresh stopped');
    }

    updateLastRefreshTime() {
        const lastRefresh = document.getElementById('lastRefresh');
        if (lastRefresh) {
            lastRefresh.textContent = new Date().toLocaleString('th-TH');
        }
    }

    handleError(message, error) {
        console.error('Dashboard Error:', message, error);
        
        // Show user-friendly error notification
        this.showNotification(message, 'error');
        
        // Update error display with more details
        const errorDisplay = document.getElementById('errorDisplay');
        if (errorDisplay) {
            const errorDetails = error?.message || 'Unknown error';
            errorDisplay.innerHTML = `
                <div class="alert alert-danger alert-dismissible" role="alert">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>เกิดข้อผิดพลาด:</strong> ${message}
                    <br><small class="text-muted">${errorDetails}</small>
                    <button type="button" class="close" onclick="this.parentElement.remove()">
                        <span>&times;</span>
                    </button>
                </div>
            `;
            
            // Auto-hide after 15 seconds
            setTimeout(() => {
                if (errorDisplay.firstElementChild) {
                    errorDisplay.firstElementChild.remove();
                }
            }, 15000);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'info'} notification fade-in`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'error' ? 'exclamation-circle' : type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
            ${message}
            <button type="button" class="close" onclick="this.parentElement.remove()">
                <span>&times;</span>
            </button>
        `;

        // Add to page
        const container = document.getElementById('notificationContainer') || document.body;
        container.appendChild(notification);

        // Auto remove after 8 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }
        }, 8000);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text.toString();
        return div.innerHTML;
    }

    // Enhanced export with more data
    async exportLeaderboard() {
        try {
            // Get current filter settings
            const gameMode = this.currentGameMode;
            const limit = Math.max(this.currentLimit, 1000); // Export more data
            
            // Fetch fresh data for export
            const response = await fetch(`${this.apiBaseUrl}/api/leaderboard?mode=${gameMode}&limit=${limit}&export=true`);
            const data = await response.json();
            
            if (!data.success || !data.data) {
                throw new Error('ไม่สามารถดึงข้อมูลสำหรับส่งออกได้');
            }
            
            const scores = data.data;
            
            // Prepare CSV data
            const csvHeaders = [
                'อันดับ', 'ชื่อผู้เล่น', 'คะแนน', 'บรรทัด', 'เลเวล', 
                'โหมดเกม', 'วันที่เล่น', 'ID'
            ];
            
            const csvData = scores.map((score, index) => {
                const rank = index + 1;
                const date = score.createdAt ? 
                    new Date(score.createdAt).toLocaleString('th-TH') : 
                    'ไม่ระบุ';
                const gameMode = score.gameMode === 'single' ? 'เดี่ยว' : 'แบบคู่';
                
                return [
                    rank,
                    score.playerName || 'Unknown',
                    score.score || 0,
                    score.lines || 0,
                    score.level || 1,
                    gameMode,
                    date,
                    score._id ? score._id.toString() : ''
                ];
            });
            
            // Convert to CSV
            const csv = [
                csvHeaders.join(','),
                ...csvData.map(row => 
                    row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
                )
            ].join('\n');
            
            // Add BOM for proper Thai character encoding
            const bom = '\uFEFF';
            const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
            
            // Download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `twobob-leaderboard-${gameMode}-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification(`ส่งออกข้อมูล ${scores.length} รายการเรียบร้อย`, 'success');
            
        } catch (error) {
            this.handleError('ไม่สามารถส่งออกข้อมูลได้', error);
        }
    }

    // Method to refresh MongoDB connection
    async reconnectDatabase() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/admin/reconnect-db`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('เชื่อมต่อฐานข้อมูลใหม่เรียบร้อย', 'success');
                await this.loadAllData();
            } else {
                throw new Error(data.message || 'Failed to reconnect');
            }
        } catch (error) {
            this.handleError('ไม่สามารถเชื่อมต่อฐานข้อมูลใหม่ได้', error);
        }
    }

    // ส่วนที่ขาดของ TwoBobDashboard class (วางต่อจากส่วนที่มีอยู่แล้ว)

    // Get real-time database stats (ต่อจากที่ขาดไป)
    async getDatabaseStats() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/database/stats`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.message || 'Failed to get database stats');
            }
        } catch (error) {
            console.error('Database stats error:', error);
            throw error;
        }
    }

    // Clear all game data (admin function)
    async clearAllData() {
        if (!confirm('คุณแน่ใจหรือไม่ที่จะลบข้อมูลทั้งหมด? การกระทำนี้ไม่สามารถยกเลิกได้!')) {
            return;
        }

        const secondConfirm = prompt('พิมพ์ "DELETE ALL" เพื่อยืนยันการลบข้อมูล:');
        if (secondConfirm !== 'DELETE ALL') {
            this.showNotification('การลบข้อมูลถูกยกเลิก', 'info');
            return;
        }

        try {
            const response = await fetch(`${this.apiBaseUrl}/api/admin/clear-data`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showNotification('ลบข้อมูลทั้งหมดเรียบร้อย', 'success');
                await this.loadAllData();
            } else {
                throw new Error(data.message || 'Failed to clear data');
            }
        } catch (error) {
            this.handleError('ไม่สามารถลบข้อมูลได้', error);
        }
    }

    // Backup database
    async backupDatabase() {
        try {
            this.showNotification('กำลังสำรองข้อมูล...', 'info');
            
            const response = await fetch(`${this.apiBaseUrl}/api/admin/backup`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `twobob-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('สำรองข้อมูลเรียบร้อย', 'success');
            
        } catch (error) {
            this.handleError('ไม่สามารถสำรองข้อมูลได้', error);
        }
    }

    // Get player detailed stats
    async getPlayerDetails(playerId) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/api/players/${encodeURIComponent(playerId)}/details`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                return data.data;
            } else {
                throw new Error(data.message || 'Failed to get player details');
            }
        } catch (error) {
            console.error('Player details error:', error);
            throw error;
        }
    }

    // Show player details modal
    async showPlayerDetails(playerName) {
        try {
            const details = await this.getPlayerDetails(playerName);
            
            // Create modal content
            const modalContent = `
                <div class="modal fade" id="playerModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">
                                    <i class="fas fa-user"></i> ข้อมูลผู้เล่น: ${this.escapeHtml(playerName)}
                                </h5>
                                <button type="button" class="close" data-dismiss="modal">
                                    <span>&times;</span>
                                </button>
                            </div>
                            <div class="modal-body">
                                <div class="row">
                                    <div class="col-md-6">
                                        <h6>สถิติทั่วไป</h6>
                                        <table class="table table-sm">
                                            <tr><td>จำนวนเกมทั้งหมด:</td><td><strong>${details.totalGames}</strong></td></tr>
                                            <tr><td>คะแนนสูงสุด:</td><td><strong>${details.highestScore.toLocaleString('th-TH')}</strong></td></tr>
                                            <tr><td>คะแนนเฉลี่ย:</td><td><strong>${Math.round(details.averageScore).toLocaleString('th-TH')}</strong></td></tr>
                                            <tr><td>บรรทัดรวม:</td><td><strong>${details.totalLines.toLocaleString('th-TH')}</strong></td></tr>
                                            <tr><td>เลเวลสูงสุด:</td><td><strong>${details.highestLevel}</strong></td></tr>
                                        </table>
                                    </div>
                                    <div class="col-md-6">
                                        <h6>สถิติตามโหมด</h6>
                                        <table class="table table-sm">
                                            <tr><td>เกมเดี่ยว:</td><td><strong>${details.singleGames || 0}</strong></td></tr>
                                            <tr><td>เกมแบบคู่:</td><td><strong>${details.multiGames || 0}</strong></td></tr>
                                        </table>
                                        
                                        <h6>วันที่เล่น</h6>
                                        <table class="table table-sm">
                                            <tr><td>เล่นครั้งแรก:</td><td>${new Date(details.firstPlayed).toLocaleString('th-TH')}</td></tr>
                                            <tr><td>เล่นครั้งล่าสุด:</td><td>${new Date(details.lastPlayed).toLocaleString('th-TH')}</td></tr>
                                        </table>
                                    </div>
                                </div>
                                
                                <h6>คะแนนล่าสุด 10 อันดับ</h6>
                                <div class="table-responsive">
                                    <table class="table table-sm">
                                        <thead>
                                            <tr>
                                                <th>คะแนน</th>
                                                <th>บรรทัด</th>
                                                <th>เลเวล</th>
                                                <th>โหมด</th>
                                                <th>วันที่</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${details.recentGames ? details.recentGames.map(game => `
                                                <tr>
                                                    <td>${game.score.toLocaleString('th-TH')}</td>
                                                    <td>${game.lines}</td>
                                                    <td>${game.level}</td>
                                                    <td>
                                                        <span class="badge badge-${game.gameMode === 'single' ? 'primary' : 'success'}">
                                                            ${game.gameMode === 'single' ? 'เดี่ยว' : 'แบบคู่'}
                                                        </span>
                                                    </td>
                                                    <td>${new Date(game.createdAt).toLocaleString('th-TH')}</td>
                                                </tr>
                                            `).join('') : '<tr><td colspan="5" class="text-center">ไม่มีข้อมูล</td></tr>'}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">ปิด</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Remove existing modal
            const existingModal = document.getElementById('playerModal');
            if (existingModal) {
                existingModal.remove();
            }
            
            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalContent);
            
            // Show modal (assuming Bootstrap is available)
            if (typeof $ !== 'undefined' && $.fn.modal) {
                $('#playerModal').modal('show');
            } else {
                // Fallback for non-Bootstrap environments
                document.getElementById('playerModal').style.display = 'block';
                document.getElementById('playerModal').classList.add('show');
            }
            
        } catch (error) {
            this.handleError('ไม่สามารถโหลดข้อมูลผู้เล่นได้', error);
        }
    }

    // Real-time updates using WebSocket (if available)
    initWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('🔌 WebSocket connected');
                this.showNotification('เชื่อมต่อการอัปเดตแบบเรียลไทม์แล้ว', 'success');
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            };
            
            this.ws.onclose = () => {
                console.log('🔌 WebSocket disconnected');
                // Try to reconnect after 5 seconds
                setTimeout(() => {
                    if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                        this.initWebSocket();
                    }
                }, 5000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
            
        } catch (error) {
            console.warn('WebSocket not available:', error);
        }
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'newScore':
                // New score added, refresh leaderboard if currently viewing
                if (this.currentView === 'leaderboard') {
                    this.loadLeaderboard(this.currentGameMode, this.currentLimit);
                }
                this.showNotification(`🎯 คะแนนใหม่: ${data.playerName} ได้ ${data.score} คะแนน!`, 'info');
                break;
                
            case 'playerJoin':
                // Player joined, update server stats
                if (this.currentView === 'server') {
                    this.loadServerStatus();
                }
                break;
                
            case 'playerLeave':
                // Player left, update server stats
                if (this.currentView === 'server') {
                    this.loadServerStatus();
                }
                break;
                
            case 'roomUpdate':
                // Room status changed
                if (this.currentView === 'stats') {
                    this.loadStats();
                }
                break;
                
            default:
                console.log('Unknown WebSocket message type:', data.type);
        }
    }

    // Performance monitoring
    startPerformanceMonitoring() {
        setInterval(() => {
            const perfData = {
                heap: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                } : null,
                timing: performance.timing ? {
                    loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart
                } : null
            };
            
            // Update performance display if element exists
            const perfDisplay = document.getElementById('performanceStats');
            if (perfDisplay && perfData.heap) {
                perfDisplay.innerHTML = `
                    <small class="text-muted">
                        Memory: ${perfData.heap.used}MB / ${perfData.heap.total}MB
                        ${perfData.heap.used / perfData.heap.total > 0.8 ? '⚠️' : ''}
                    </small>
                `;
            }
        }, 10000); // Every 10 seconds
    }

    // Cleanup method
    destroy() {
        console.log('🧹 Cleaning up TwoBob Dashboard...');
        
        // Stop auto refresh
        this.stopAutoRefresh();
        
        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        // Clear any remaining timeouts
        // Remove event listeners if needed
        
        console.log('✅ Dashboard cleanup completed');
    }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if we're on the dashboard page
    if (document.getElementById('leaderboardBody') || document.querySelector('[data-tab]')) {
        window.dashboard = new TwoBobDashboard();
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            if (window.dashboard) {
                window.dashboard.destroy();
            }
        });
    }
});

// Global functions for HTML onclick events
window.showPlayerDetails = (playerName) => {
    if (window.dashboard) {
        window.dashboard.showPlayerDetails(playerName);
    }
};

window.reconnectDatabase = () => {
    if (window.dashboard) {
        window.dashboard.reconnectDatabase();
    }
};

window.clearAllData = () => {
    if (window.dashboard) {
        window.dashboard.clearAllData();
    }
};

window.backupDatabase = () => {
    if (window.dashboard) {
        window.dashboard.backupDatabase();
    }
};
