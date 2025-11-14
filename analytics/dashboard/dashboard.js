// Dashboard Configuration
const API_BASE = window.location.origin;
const AUTH = 'Basic ' + btoa('admin:admin'); // Default credentials

let timelineChart = null;
let eventsChart = null;
let currentPeriod = '7d';

// Excluded users (test accounts) - filter in frontend
const EXCLUDED_USER_IDS = ['f6824baf', '1bcfc4c6'];

// Helper functions
function isExcludedUser(userId) {
    return EXCLUDED_USER_IDS.some(excludedId => userId.startsWith(excludedId));
}

function formatDuration(seconds) {
    if (seconds < 60) {
        return `${seconds.toFixed(1)}s`;
    } else {
        const minutes = (seconds / 60).toFixed(1);
        return `${minutes}m`;
    }
}

function formatCost(cost) {
    if (cost === 0) return '$0.00';
    if (cost < 0.0001) return `$${cost.toFixed(6)}`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
}

// User filter state
let allUsers = [];
let selectedUserIds = new Set();

// Days filter functions
function setupDaysFilter() {
    const btn = document.getElementById('daysFilterBtn');
    const dropdown = document.getElementById('daysFilterDropdown');
    
    // Toggle dropdown
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
        btn.classList.toggle('open', !isOpen);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
        btn.classList.remove('open');
    });
    
    dropdown?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Radio buttons change
    document.querySelectorAll('input[name="days"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            recordingsState.days = parseInt(e.target.value);
            recordingsState.page = 1;
            
            // Update label
            const labels = {
                '1': 'Last 24 hours',
                '7': 'Last 7 days'
            };
            document.getElementById('daysFilterLabel').textContent = labels[e.target.value];
            
            // Close dropdown
            dropdown.style.display = 'none';
            btn.classList.remove('open');
            
            // Reload users with new period filter
            await loadUsers();
            loadRecentRecordings();
        });
    });
}

// Duration filter functions
function setupDurationFilter() {
    const btn = document.getElementById('durationFilterBtn');
    const dropdown = document.getElementById('durationFilterDropdown');
    const selectAllCheckbox = document.getElementById('selectAllDurations');
    
    // Toggle dropdown
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
        btn.classList.toggle('open', !isOpen);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
        btn.classList.remove('open');
    });
    
    dropdown?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Prevent scroll from propagating to body when scrolling in dropdown
    dropdown?.addEventListener('wheel', (e) => {
        e.stopPropagation();
    });
    
    dropdown?.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    });
    
    // Select All checkbox
    selectAllCheckbox?.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        
        // Update all duration checkboxes
        document.querySelectorAll('.duration-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
            const duration = checkbox.dataset.duration;
            if (isChecked) {
                selectedDurations.add(duration);
            } else {
                selectedDurations.delete(duration);
            }
        });
        
        updateDurationFilterLabel();
        recordingsState.page = 1;
        // Reload users to filter out users without recordings matching duration filters
        await loadUsers();
        loadRecentRecordings();
    });
    
    // Individual duration checkboxes
    document.querySelectorAll('.duration-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const duration = e.target.dataset.duration;
            
            if (e.target.checked) {
                selectedDurations.add(duration);
            } else {
                selectedDurations.delete(duration);
            }
            
            // Update "Select All" checkbox
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = selectedDurations.size === allDurations.length;
            }
            
            updateDurationFilterLabel();
            recordingsState.page = 1;
            // Reload users to filter out users without recordings matching duration filters
            await loadUsers();
            loadRecentRecordings();
        });
    });
}

function updateDurationFilterLabel() {
    const label = document.getElementById('durationFilterLabel');
    if (!label) return;
    
    const selectedCount = selectedDurations.size;
    const totalCount = allDurations.length;
    
    if (selectedCount === 0) {
        label.textContent = 'No Durations Selected';
    } else if (selectedCount === totalCount) {
        label.textContent = 'All Durations';
    } else if (selectedCount === 1) {
        const duration = Array.from(selectedDurations)[0];
        const labels = {
            '0-60': 'Less than 1 minute',
            '60-300': '1 to 5 minutes',
            '300-600': '5 to 10 minutes',
            '600-1200': 'More than 10 minutes'
        };
        label.textContent = labels[duration] || duration;
    } else {
        label.textContent = `${selectedCount} Durations`;
    }
}

// User filter functions
function setupUserFilter() {
    const btn = document.getElementById('userFilterBtn');
    const dropdown = document.getElementById('userFilterDropdown');
    const selectAllCheckbox = document.getElementById('selectAllUsers');
    
    // Toggle dropdown
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
        btn.classList.toggle('open', !isOpen);
        
        // Prevent body scroll when dropdown is open
        if (!isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    });
    
    // Close dropdown when clicking outside
    const closeDropdown = () => {
        dropdown.style.display = 'none';
        btn.classList.remove('open');
        document.body.style.overflow = '';
    };
    
    document.addEventListener('click', closeDropdown);
    
    dropdown?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Prevent scroll from propagating to body when scrolling in dropdown
    dropdown?.addEventListener('wheel', (e) => {
        e.stopPropagation();
        // Check if we're at the top or bottom of the dropdown
        const { scrollTop, scrollHeight, clientHeight } = dropdown;
        const isAtTop = scrollTop === 0;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;
        
        // If at top and scrolling up, or at bottom and scrolling down, prevent default
        if ((isAtTop && e.deltaY < 0) || (isAtBottom && e.deltaY > 0)) {
            e.preventDefault();
        }
    }, { passive: false });
    
    dropdown?.addEventListener('touchmove', (e) => {
        e.stopPropagation();
    }, { passive: false });
    
    // Select All checkbox
    selectAllCheckbox?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        
        // Update all user checkboxes
        document.querySelectorAll('.user-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
            const userId = checkbox.dataset.userId;
            if (isChecked) {
                selectedUserIds.add(userId);
            } else {
                selectedUserIds.delete(userId);
            }
        });
        
        updateUserFilterLabel();
        recordingsState.page = 1;
        loadRecentRecordings();
    });
}

async function loadUsers() {
    // Load ONLY users that have transcription_completed events in the selected period
    // and match the selected duration filters
    try {
        // Use the same days filter as the recordings table
        const days = recordingsState.days;
        
        // Build query params
        const params = new URLSearchParams({
            days: days,
            event_type: 'transcription_completed'
        });
        
        // Add duration filters if any are selected
        // If all are selected, don't filter (show all)
        if (selectedDurations.size > 0 && selectedDurations.size < allDurations.length) {
            const durationRanges = Array.from(selectedDurations);
            params.append('duration_ranges', durationRanges.join(','));
        }
        
        // Only load users with transcription_completed events matching filters
        const response = await fetch(`${API_BASE}/users?${params}`, {
            headers: { 'Authorization': AUTH }
        });

        if (!response.ok) {
            console.error('Failed to load users');
            return;
        }

        const data = await response.json();
        
        if (!data.success || !data.users || data.users.length === 0) {
            allUsers = [];
            selectedUserIds.clear();
            renderUserFilter();
            return;
        }

        // Convert user IDs to user objects
        // Backend already filters by transcription_completed events in the selected period
        allUsers = data.users.map(userId => ({
            id: userId,
            shortId: userId.substring(0, 8),
            isTestAccount: isExcludedUser(userId)
        }));
        
        // Sort: test accounts last
        allUsers.sort((a, b) => {
            if (a.isTestAccount && !b.isTestAccount) return 1;
            if (!a.isTestAccount && b.isTestAccount) return -1;
            return a.shortId.localeCompare(b.shortId);
        });
        
        // Initialize selected users (ALL users by default)
        selectedUserIds.clear();
        allUsers.forEach(user => {
            selectedUserIds.add(user.id); // Select ALL users
        });
        
        renderUserFilter();
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function renderUserFilter() {
    const listContainer = document.getElementById('userFilterList');
    if (!listContainer) return;
    
    // Show all users, but if more than 10, show last one cut off
    const maxVisible = 10;
    const shouldTruncate = allUsers.length > maxVisible;
    
    let html = allUsers.map((user, index) => {
        const isSelected = selectedUserIds.has(user.id);
        const testClass = user.isTestAccount ? ' test-account' : '';
        
        // If this is the last visible user and there are more, cut it off
        const isLastVisible = shouldTruncate && index === maxVisible - 1;
        const cutOffClass = isLastVisible ? ' user-cutoff' : '';
        
        return `
            <label class="filter-item${testClass}${cutOffClass}">
                <input 
                    type="checkbox" 
                    class="user-checkbox" 
                    data-user-id="${user.id}"
                    ${isSelected ? 'checked' : ''}
                >
                <span>User ${user.shortId}...</span>
            </label>
        `;
    }).join('');
    
    listContainer.innerHTML = html;
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.user-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const userId = e.target.dataset.userId;
            
            if (e.target.checked) {
                selectedUserIds.add(userId);
            } else {
                selectedUserIds.delete(userId);
            }
            
            // Update "Select All" checkbox
            const selectAllCheckbox = document.getElementById('selectAllUsers');
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = selectedUserIds.size === allUsers.length;
            }
            
            updateUserFilterLabel();
            recordingsState.page = 1;
            loadRecentRecordings();
        });
    });
    
    updateUserFilterLabel();
}

function updateUserFilterLabel() {
    const label = document.getElementById('userFilterLabel');
    if (!label) return;
    
    const selectedCount = selectedUserIds.size;
    const totalCount = allUsers.length;
    
    if (selectedCount === 0) {
        label.textContent = 'No Users Selected';
    } else if (selectedCount === totalCount) {
        label.textContent = 'All Users';
    } else if (selectedCount === 1) {
        const userId = Array.from(selectedUserIds)[0];
        const user = allUsers.find(u => u.id === userId);
        label.textContent = `User ${user?.shortId}...`;
    } else {
        label.textContent = `${selectedCount} Users`;
    }
}

// Duration filter state
let allDurations = ['0-60', '60-300', '300-600', '600-1200'];
let selectedDurations = new Set(allDurations); // All selected by default

// Pagination state
let recordingsState = {
    days: 1, // Default to 24 hours
    page: 1,
    perPage: 20,
    totalPages: 1
};

let errorsState = {
    days: 30,
    page: 1,
    perPage: 20,
    totalPages: 1
};

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    setupEventListeners();
    // Initialize duration filter label
    updateDurationFilterLabel();
    // Auto-refresh every 60 seconds
    setInterval(loadDashboard, 60000);
});

function setupEventListeners() {
    // Timeline period selector (converted to dropdown)
    setupTimelinePeriodFilter();

    // Recordings filters
    setupDaysFilter();
    setupDurationFilter();
    setupUserFilter();
    setupRecordingsPagination();
    
    // Errors filters
    setupErrorsDaysFilter();
    setupErrorsPagination();
}

// Timeline period filter functions
function setupTimelinePeriodFilter() {
    const btn = document.getElementById('timelinePeriodBtn');
    const dropdown = document.getElementById('timelinePeriodDropdown');
    
    // Toggle dropdown
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
        btn.classList.toggle('open', !isOpen);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
        btn.classList.remove('open');
    });
    
    dropdown?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Radio buttons change
    document.querySelectorAll('input[name="timelinePeriod"]').forEach(radio => {
        radio.addEventListener('change', async (e) => {
            currentPeriod = e.target.value;
            
            // Update label
            const labels = {
                '7d': 'Last 7 Days',
                '30d': 'Last 30 Days'
            };
            document.getElementById('timelinePeriodLabel').textContent = labels[e.target.value];
            
            // Close dropdown
            dropdown.style.display = 'none';
            btn.classList.remove('open');
            
            await loadDashboard();
        });
    });
}

// Errors days filter functions
function setupErrorsDaysFilter() {
    const btn = document.getElementById('errorsDaysFilterBtn');
    const dropdown = document.getElementById('errorsDaysFilterDropdown');
    const label = document.getElementById('errorsDaysFilterLabel');
    
    // Toggle dropdown
    btn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = dropdown.style.display === 'block';
        dropdown.style.display = isOpen ? 'none' : 'block';
        btn.classList.toggle('open', !isOpen);
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.style.display = 'none';
        btn.classList.remove('open');
    });
    
    dropdown?.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    
    // Radio buttons change
    document.querySelectorAll('input[name="errorsDays"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            errorsState.days = parseInt(e.target.value);
            errorsState.page = 1; // Reset to first page
            
            // Update label
            const labels = {
                '7': 'Last 7 days',
                '30': 'Last 30 days',
                '90': 'Last 90 days'
            };
            label.textContent = labels[e.target.value];
            
            // Close dropdown
            dropdown.style.display = 'none';
            btn.classList.remove('open');
            
            loadRecentErrors();
        });
    });
}

// Recordings pagination
function setupRecordingsPagination() {
    document.getElementById('recordingsPrevBtn')?.addEventListener('click', () => {
        if (recordingsState.page > 1) {
            recordingsState.page--;
            loadRecentRecordings();
        }
    });

    document.getElementById('recordingsNextBtn')?.addEventListener('click', () => {
        if (recordingsState.page < recordingsState.totalPages) {
            recordingsState.page++;
            loadRecentRecordings();
        }
    });
}

// Errors pagination
function setupErrorsPagination() {
    document.getElementById('errorsPrevBtn')?.addEventListener('click', () => {
        if (errorsState.page > 1) {
            errorsState.page--;
            loadRecentErrors();
        }
    });

    document.getElementById('errorsNextBtn')?.addEventListener('click', () => {
        if (errorsState.page < errorsState.totalPages) {
            errorsState.page++;
            loadRecentErrors();
    }
    });
}

async function loadDashboard() {
    try {
        // Load stats with authentication and selected period
        const response = await fetch(`${API_BASE}/stats?period=${currentPeriod}`, {
            headers: {
                'Authorization': AUTH
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.success) {
            updateSummaryCards(data.summary);
            updateTimelineChart(data.daily_stats);
            updateEventsChart(data.summary);
            await loadRecentRecordings();
            await loadRecentErrors();
            hideError();
        } else {
            showError('Failed to load stats: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showError('Failed to connect to API: ' + error.message);
    }
}

function updateSummaryCards(summary) {
    document.getElementById('totalUsers').textContent = summary.total_users || 0;
    document.getElementById('activeUsers7d').textContent = summary.active_users_7d || 0;
    
    // Success rate
    const successRate = summary.success_rate || 0;
    document.getElementById('successRate').textContent = `${successRate.toFixed(1)}%`;
    document.getElementById('successRateMeta').textContent = 
        `${summary.successful_recordings || 0} of ${summary.total_recordings || 0} transcriptions`;
    
    // Total cost with period label
    const totalCost = summary.total_cost_usd || 0;
    document.getElementById('totalCost').textContent = formatCost(totalCost);
    
    // Update cost period label
    const periodLabel = currentPeriod === '7d' ? 'Last 7 days' : 'Last 30 days';
    const costMetaElement = document.querySelector('.stat-card:nth-child(4) .stat-meta');
    if (costMetaElement) {
        costMetaElement.textContent = periodLabel;
    }
}

function updateTimelineChart(dailyStats) {
    const ctx = document.getElementById('timelineChart');
    if (!ctx) return;

    // Prepare data
    const dates = dailyStats.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const recordings = dailyStats.map(d => d.recordings);

    // Destroy previous chart
    if (timelineChart) {
        timelineChart.destroy();
    }

    // Create new chart
    timelineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [{
                label: 'Recordings',
                data: recordings,
                borderColor: '#4A9EFF',
                backgroundColor: 'rgba(74, 158, 255, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        color: '#808080',
                        stepSize: 1
                    },
                    grid: {
                        color: '#2A2A2A'
                    }
                },
                x: {
                    ticks: {
                        color: '#808080'
                    },
                    grid: {
                        color: '#2A2A2A'
                    }
                }
            }
        }
    });
}

function updateEventsChart(summary) {
    const ctx = document.getElementById('eventsChart');
    if (!ctx) return;

    // Destroy previous chart
    if (eventsChart) {
        eventsChart.destroy();
    }

    // Calculate event counts
    const transcriptions = summary.transcription_completed_count || 0;
    const errors = summary.transcription_failed_count || 0;
    const appOpened = summary.app_opened_count || 0;
    const recordingStarted = summary.recording_started_count || 0;
    
    // Calculate "Other" events (app opens, recording started, etc)
    const otherEvents = appOpened + recordingStarted;

    // Create new chart
    eventsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Transcriptions', 'Errors', 'App Opens', 'Recordings Started'],
            datasets: [{
                data: [transcriptions, errors, appOpened, recordingStarted],
                backgroundColor: ['#4A9EFF', '#FF6666', '#FFB84D', '#9B59B6'],
                borderColor: '#1A1A1A',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { 
                        color: '#E0E0E0',
                        padding: 15
                    }
                }
            }
        }
    });
}

async function loadRecentRecordings() {
    try {
        // Load users for filter (only on first load)
        if (allUsers.length === 0) {
            await loadUsers();
        }

        // Check if any users are selected
        const tbody = document.getElementById('recordingsBody');
        
        if (selectedUserIds.size === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #606060;">No users selected. Select at least one user to view recordings.</td></tr>';
            updatePaginationInfo('recordings', 0, 0, 0, 1);
            return;
        }

        // Build query params with user filter and duration filter
        const params = new URLSearchParams({
            event_type: 'transcription_completed',
            days: recordingsState.days,
            page: recordingsState.page,
            per_page: recordingsState.perPage,
            user_ids: Array.from(selectedUserIds).join(',')  // Send selected users to backend
        });
        
        // Add duration filters if any are selected
        // If all are selected, don't filter (show all)
        if (selectedDurations.size > 0 && selectedDurations.size < allDurations.length) {
            // Build OR conditions for multiple duration ranges
            // We'll send them as separate parameters and handle in backend
            const durationRanges = Array.from(selectedDurations);
            params.append('duration_ranges', durationRanges.join(','));
        }

        const response = await fetch(`${API_BASE}/events?${params}`, {
            headers: { 'Authorization': AUTH }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.events || data.events.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #606060;">No recordings for selected users in this period</td></tr>';
            // Reset pagination to show 0 results correctly
            recordingsState.totalPages = 1;
            updatePaginationInfo('recordings', 0, 0, 0, 1);
            updatePaginationButtons('recordings', false, false, 1, 1);
            return;
        }

        // Render events directly (no frontend filtering needed - backend already filtered)
        tbody.innerHTML = data.events.map(event => {
            const date = new Date(event.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const userId = event.user_id.substring(0, 8);
            
            // Handle properties - could be object or string (JSONB serialization issue)
            let properties = event.properties;
            if (typeof properties === 'string') {
                try {
                    properties = JSON.parse(properties);
                } catch (e) {
                    console.warn('Failed to parse properties as JSON:', e);
                    properties = {};
                }
            }
            if (!properties || typeof properties !== 'object') {
                properties = {};
            }
            
            const duration = parseFloat(properties.duration_seconds || properties.audio_duration_seconds || 0);
            
            // Support both cost_usd and estimated_cost_usd
            // If cost is missing (undefined/null), calculate it from duration (Whisper pricing: $0.006 per minute)
            let cost = properties.cost_usd ?? properties.estimated_cost_usd;
            
            // DEBUG: Log cost information for first event
            if (data.events.indexOf(event) === 0) {
                console.log('🔍 DEBUG - First event cost check:', {
                    'event.properties': event.properties,
                    'properties (parsed)': properties,
                    'cost_usd': properties.cost_usd,
                    'estimated_cost_usd': properties.estimated_cost_usd,
                    'duration': duration,
                    'calculated cost': duration > 0 ? (duration / 60.0) * 0.006 : 0
                });
            }
            
            if (cost === undefined || cost === null || cost === '') {
                // Calculate cost from duration if not present
                if (duration > 0) {
                    const minutes = duration / 60.0;
                    cost = minutes * 0.006;
                } else {
                    cost = 0;
                }
            } else {
                // Ensure cost is a number
                cost = parseFloat(cost) || 0;
            }
            
            const platform = event.platform || 'unknown';

            return `
                <tr>
                    <td>${date}</td>
                    <td>${userId}...</td>
                    <td>${formatDuration(duration)}</td>
                    <td>${formatCost(cost)}</td>
                    <td>${platform}</td>
                </tr>
            `;
        }).join('');

        // Update pagination
        const { pagination } = data;
        recordingsState.totalPages = pagination.total_pages;
        
        const startIdx = (pagination.page - 1) * pagination.per_page + 1;
        const endIdx = Math.min(pagination.page * pagination.per_page, pagination.total_count);
        
        updatePaginationInfo('recordings', startIdx, endIdx, pagination.total_count, pagination.total_pages);
        updatePaginationButtons('recordings', pagination.has_prev, pagination.has_next, pagination.page, pagination.total_pages);

        // Populate user filter if empty
        if (!recordingsState.userFilter && data.events.length > 0) {
            populateUserFilter(data.events);
        }

    } catch (error) {
        console.error('Error loading recordings:', error);
        document.getElementById('recordingsBody').innerHTML = 
            '<tr><td colspan="5" style="text-align: center; color: #FF6666;">Error loading recordings</td></tr>';
    }
}

async function loadRecentErrors() {
    try {
        const params = new URLSearchParams({
            event_type: 'transcription_failed',
            days: errorsState.days,
            page: errorsState.page,
            per_page: errorsState.perPage
        });

        const response = await fetch(`${API_BASE}/events?${params}`, {
            headers: { 'Authorization': AUTH }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.events || data.events.length === 0) {
            document.getElementById('errorsBody').innerHTML = 
                '<tr><td colspan="5" style="text-align: center; color: #606060;">No errors in this period</td></tr>';
            updatePaginationInfo('errors', 0, 0, 0, 1);
            return;
        }

        // Update errors table
        const tbody = document.getElementById('errorsBody');
        tbody.innerHTML = data.events.map(event => {
            const date = new Date(event.timestamp).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            const userId = event.user_id.substring(0, 8);
            const errorType = event.properties?.error_type || 'Unknown';
            const errorMessage = event.properties?.error_message || 'No message';
            const platform = event.platform || 'unknown';

            return `
                <tr>
                    <td>${date}</td>
                    <td>${userId}...</td>
                    <td>${errorType}</td>
                    <td>${errorMessage}</td>
                    <td>${platform}</td>
                </tr>
            `;
        }).join('');

        // Update pagination
        const { pagination } = data;
        errorsState.totalPages = pagination.total_pages;
        
        const startIdx = (pagination.page - 1) * pagination.per_page + 1;
        const endIdx = Math.min(pagination.page * pagination.per_page, pagination.total_count);
        
        updatePaginationInfo('errors', startIdx, endIdx, pagination.total_count, pagination.total_pages);
        updatePaginationButtons('errors', pagination.has_prev, pagination.has_next, pagination.page, pagination.total_pages);

    } catch (error) {
        console.error('Error loading errors:', error);
        document.getElementById('errorsBody').innerHTML = 
            '<tr><td colspan="5" style="text-align: center; color: #FF6666;">Error loading errors</td></tr>';
    }
}

function populateUserFilter(events) {
    const uniqueUsers = [...new Set(events.map(e => e.user_id))];
    const userFilter = document.getElementById('userIdFilter');
    
    if (userFilter && uniqueUsers.length > 0) {
        userFilter.innerHTML = '<option value="">All Users</option>' + 
            uniqueUsers.map(userId => {
                const shortId = userId.substring(0, 8);
                return `<option value="${userId}">${shortId}...</option>`;
            }).join('');
    }
}

function updatePaginationInfo(table, start, end, total, totalPages) {
    const infoEl = document.getElementById(`${table}PaginationInfo`);
    if (infoEl) {
        if (total === 0) {
            infoEl.innerHTML = '<span>No results</span>';
        } else {
            infoEl.innerHTML = `<span>Showing ${start}-${end} of ${total} results</span>`;
        }
    }
}

function updatePaginationButtons(table, hasPrev, hasNext, currentPage, totalPages) {
    const prevBtn = document.getElementById(`${table}PrevBtn`);
    const nextBtn = document.getElementById(`${table}NextBtn`);
    const pageInfo = document.getElementById(`${table}PageInfo`);

    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
}

function showError(message) {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

function hideError() {
    const errorDiv = document.getElementById('error-message');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}
