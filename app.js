// --- BandSync: Event-Driven Attendance Management Engine ---

// Initial Empty Defaults
const DEFAULT_MEMBERS = [];

const DEFAULT_CONFIG = {
    band1MaestroId: '',
    band2MaestroId: ''
};

const DEFAULT_EVENTS = [];

// App State
let state = {
    members: [],
    config: {},
    events: [],
    activeEventId: '',
    currentTab: 'view-events',
    rosterFilter: 'all',
    rosterSearch: '',
    attendanceSearch: '',
    historyFilters: {
        bandType: 'all',
        maestro: 'all',
        dateRange: 'all'
    }
};

const IS_SERVER = window.location.protocol.startsWith('http');

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    setupEventListeners();
    renderAll();
    lucide.createIcons();
});

// Load state from Backend REST API (with LocalStorage cache fallback)
async function loadState() {
    let loadedFromServer = false;
    if (IS_SERVER) {
        try {
            const res = await fetch('/api/state');
            if (res.ok) {
                const data = await res.json();
                state.members = data.members || [];
                state.config = data.config || { ...DEFAULT_CONFIG };
                state.events = data.events || [];
                loadedFromServer = true;
            }
        } catch (e) {
            console.warn('Could not connect to /api/state, loading from LocalStorage:', e);
        }
    }

    if (!loadedFromServer) {
        const savedMembers = localStorage.getItem('bandsync_v2_members');
        state.members = savedMembers ? JSON.parse(savedMembers) : [...DEFAULT_MEMBERS];

        const savedConfig = localStorage.getItem('bandsync_v2_config');
        state.config = savedConfig ? JSON.parse(savedConfig) : { ...DEFAULT_CONFIG };

        const savedEvents = localStorage.getItem('bandsync_v2_events');
        state.events = savedEvents ? JSON.parse(savedEvents) : [...DEFAULT_EVENTS];
    }

    if (state.events.length > 0 && !state.activeEventId) {
        state.activeEventId = state.events[0].id;
    }

    saveState();
}

function saveState() {
    localStorage.setItem('bandsync_v2_members', JSON.stringify(state.members));
    localStorage.setItem('bandsync_v2_config', JSON.stringify(state.config));
    localStorage.setItem('bandsync_v2_events', JSON.stringify(state.events));
}

// Backend API Mutators
async function apiSaveAttendance(event) {
    if (!IS_SERVER) return;
    try {
        await fetch(`/api/events/${event.id}/attendance`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                attendance: event.attendance,
                careOfDetails: event.careOfDetails,
                status: event.status
            })
        });
    } catch (err) {
        console.error('Failed to sync attendance to backend:', err);
    }
}

async function apiSaveEvent(event, isNew = false) {
    if (!IS_SERVER) return;
    try {
        const url = isNew ? '/api/events' : `/api/events/${event.id}`;
        const method = isNew ? 'POST' : 'PUT';
        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event)
        });
    } catch (err) {
        console.error('Failed to sync event to backend:', err);
    }
}

async function apiSaveMember(member, isNew = false) {
    if (!IS_SERVER) return;
    try {
        const url = isNew ? '/api/members' : `/api/members/${member.id}`;
        const method = isNew ? 'POST' : 'PUT';
        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(member)
        });
    } catch (err) {
        console.error('Failed to sync member to backend:', err);
    }
}

async function apiDeleteMember(memberId) {
    if (!IS_SERVER) return;
    try {
        await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
    } catch (err) {
        console.error('Failed to delete member on backend:', err);
    }
}

async function apiSaveConfig(config) {
    if (!IS_SERVER) return;
    try {
        await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
    } catch (err) {
        console.error('Failed to sync config to backend:', err);
    }
}

// Master Render Method
function renderAll() {
    renderNavigation();
    renderActiveEventView();
    renderHistoryView();
    renderRosterView();
    populateSelectDropdowns();
    lucide.createIcons();
}

// Populate Dropdown Menus
function populateSelectDropdowns() {
    // Active Event Selector
    const eventSelect = document.getElementById('active-event-select');
    if (eventSelect) {
        eventSelect.innerHTML = state.events.map(e => `
            <option value="${e.id}" ${e.id === state.activeEventId ? 'selected' : ''}>
                ${escapeHtml(e.title)} (${formatDate(e.date)} - ${getEnsembleLabel(e.ensembleType)})
            </option>
        `).join('');
    }

    // Primary Maestros Config dropdowns
    const maestros = state.members.filter(m => !m.isDeleted && (m.isMaestro || m.assignedBand === 'both' || m.assignedBand === 'band1' || m.assignedBand === 'band2'));
    
    const band1MaestroSelect = document.getElementById('select-band1-maestro');
    if (band1MaestroSelect) {
        band1MaestroSelect.innerHTML = maestros.map(m => `
            <option value="${m.id}" ${m.id === state.config.band1MaestroId ? 'selected' : ''}>${escapeHtml(m.name)}</option>
        `).join('');
    }

    const band2MaestroSelect = document.getElementById('select-band2-maestro');
    if (band2MaestroSelect) {
        band2MaestroSelect.innerHTML = maestros.map(m => `
            <option value="${m.id}" ${m.id === state.config.band2MaestroId ? 'selected' : ''}>${escapeHtml(m.name)}</option>
        `).join('');
    }

    // Event Modal Designated Maestro dropdown (for Full Band)
    const fullBandMaestroSelect = document.getElementById('event-input-maestro');
    if (fullBandMaestroSelect) {
        const maestroCandidates = state.members.filter(m => !m.isDeleted && (m.isMaestro || m.id === state.config.band1MaestroId || m.id === state.config.band2MaestroId));
        fullBandMaestroSelect.innerHTML = maestroCandidates.map(m => `
            <option value="${m.id}">${escapeHtml(m.name)} (${getBandLabel(m.assignedBand)})</option>
        `).join('');
    }

    // History filter maestro dropdown
    const historyMaestroSelect = document.getElementById('filter-maestro');
    if (historyMaestroSelect) {
        historyMaestroSelect.innerHTML = `<option value="all">All Maestros</option>` + maestros.map(m => `
            <option value="${m.id}" ${state.historyFilters.maestro === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>
        `).join('');
    }
}

// ----------------------------------------------------
// TAB 1: ACTIVE EVENT & ATTENDANCE TRACKING (Story 2 & 3)
// ----------------------------------------------------
function renderActiveEventView() {
    const activeEvent = state.events.find(e => e.id === state.activeEventId);
    const heroCard = document.getElementById('active-event-card');
    const maestroCard = document.getElementById('event-maestro-card');
    const rosterList = document.getElementById('attendance-roster-list');
    const countBadge = document.getElementById('roster-count-badge');

    if (!activeEvent) {
        heroCard.innerHTML = `<p class="view-desc" style="text-align: center; padding: 20px 0;">No active event selected. Click "+ New Event" to create one.</p>`;
        maestroCard.innerHTML = '';
        rosterList.innerHTML = '';
        updateStatsCounters(0, 0, 0, 0);
        return;
    }

    // Render Event Hero Details
    const maestroObj = state.members.find(m => m.id === activeEvent.maestroId);
    heroCard.innerHTML = `
        <div class="event-hero-top">
            <div>
                <h3 class="event-hero-title">${escapeHtml(activeEvent.title)}</h3>
                <span class="ensemble-badge badge-${activeEvent.ensembleType}">${getEnsembleLabel(activeEvent.ensembleType)}</span>
            </div>
            <button class="sm-btn" onclick="openEditEventModal('${activeEvent.id}')">
                <i data-lucide="edit-3"></i> Edit
            </button>
        </div>
        <div class="event-meta-grid">
            <div class="meta-item"><i data-lucide="calendar"></i> <span>${formatDate(activeEvent.date)}</span></div>
            <div class="meta-item"><i data-lucide="clock"></i> <span>Call Time: ${activeEvent.callTime}</span></div>
            <div class="meta-item"><i data-lucide="map-pin"></i> <span>${escapeHtml(activeEvent.venue)}</span></div>
            <div class="meta-item"><i data-lucide="crown"></i> <span>Maestro: ${maestroObj ? escapeHtml(maestroObj.name) : 'None'}</span></div>
        </div>
    `;

    // Compute Active Roster for this Event
    const assignedMembers = getEventRoster(activeEvent);
    countBadge.textContent = assignedMembers.length;

    // Maestro Row
    if (maestroObj) {
        const maestroStatus = activeEvent.attendance[maestroObj.id] || '';
        const coveredBy = (activeEvent.careOfDetails && activeEvent.careOfDetails[maestroObj.id]) || '';
        maestroCard.innerHTML = `
            <div class="member-info-row">
                <div class="member-name-tag">
                    <span class="member-name">${escapeHtml(maestroObj.name)}</span>
                    <span class="member-sub"><i data-lucide="crown" style="width:12px; height:12px; color:gold; display:inline;"></i> Conductor / Maestro</span>
                    ${maestroStatus === 'careof' ? `<span class="careof-badge" style="cursor:pointer;" onclick="handleCareOfClick('${activeEvent.id}', '${maestroObj.id}')"><i data-lucide="refresh-cw" style="width:11px; height:11px;"></i> C/O: ${escapeHtml(coveredBy)} (Edit)</span>` : ''}
                </div>
            </div>
            <div class="attendance-actions">
                <button class="att-btn present ${maestroStatus === 'present' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${maestroObj.id}', 'present')">
                    <i data-lucide="check-circle-2"></i> Present
                </button>
                <button class="att-btn absent ${maestroStatus === 'absent' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${maestroObj.id}', 'absent')">
                    <i data-lucide="x-circle"></i> Absent
                </button>
                <button class="att-btn leave ${maestroStatus === 'leave' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${maestroObj.id}', 'leave')">
                    <i data-lucide="clock-4"></i> Leave
                </button>
                <button class="att-btn careof ${maestroStatus === 'careof' ? 'active' : ''}" onclick="handleCareOfClick('${activeEvent.id}', '${maestroObj.id}')">
                    <i data-lucide="refresh-cw"></i> C/O
                </button>
            </div>
        `;
    } else {
        maestroCard.innerHTML = `<p class="view-desc">No designated maestro for this event.</p>`;
    }

    // Filter roster by search
    const filteredRoster = assignedMembers.filter(m => {
        const q = state.attendanceSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.instrument.toLowerCase().includes(q);
    });

    // Render Musicians Roster
    if (filteredRoster.length === 0) {
        rosterList.innerHTML = `<p class="view-desc" style="text-align:center; padding: 20px 0;">No musicians found matching query.</p>`;
    } else {
        rosterList.innerHTML = filteredRoster.map(m => {
            const status = activeEvent.attendance[m.id] || '';
            const coveredBy = (activeEvent.careOfDetails && activeEvent.careOfDetails[m.id]) || '';
            return `
                <div class="roster-card">
                    <div class="member-info-row">
                        <div class="member-name-tag">
                            <span class="member-name">${escapeHtml(m.name)}</span>
                            <span class="member-sub">${escapeHtml(m.instrument)} &bull; ${getBandLabel(m.assignedBand)}</span>
                            ${status === 'careof' ? `<span class="careof-badge" style="cursor:pointer;" onclick="handleCareOfClick('${activeEvent.id}', '${m.id}')"><i data-lucide="refresh-cw" style="width:11px; height:11px;"></i> C/O: ${escapeHtml(coveredBy)} (Edit)</span>` : ''}
                        </div>
                    </div>
                    <div class="attendance-actions">
                        <button class="att-btn present ${status === 'present' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${m.id}', 'present')">
                            <i data-lucide="check-circle-2"></i> Present
                        </button>
                        <button class="att-btn absent ${status === 'absent' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${m.id}', 'absent')">
                            <i data-lucide="x-circle"></i> Absent
                        </button>
                        <button class="att-btn leave ${status === 'leave' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${m.id}', 'leave')">
                            <i data-lucide="clock-4"></i> Leave
                        </button>
                        <button class="att-btn careof ${status === 'careof' ? 'active' : ''}" onclick="handleCareOfClick('${activeEvent.id}', '${m.id}')">
                            <i data-lucide="refresh-cw"></i> C/O
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Calculate Summary Stats for this Event (Including Maestro if present)
    const allParticipants = maestroObj ? [maestroObj, ...assignedMembers] : assignedMembers;
    let presentCount = 0;
    let absentCount = 0;
    let leaveCount = 0;
    let careOfCount = 0;

    allParticipants.forEach(p => {
        const s = activeEvent.attendance[p.id];
        if (s === 'present') presentCount++;
        else if (s === 'absent') absentCount++;
        else if (s === 'leave') leaveCount++;
        else if (s === 'careof') careOfCount++;
    });

    const turnoutRate = allParticipants.length > 0 ? Math.round(((presentCount + careOfCount) / allParticipants.length) * 100) : 0;

    updateStatsCounters(presentCount, absentCount, leaveCount, careOfCount, turnoutRate);
}

function updateStatsCounters(present, absent, leave, careof, turnout) {
    document.getElementById('stat-present').textContent = present;
    document.getElementById('stat-absent').textContent = absent;
    document.getElementById('stat-leave').textContent = leave;
    document.getElementById('stat-careof').textContent = careof;
    document.getElementById('stat-turnout').textContent = `${turnout}%`;
}

// Get assigned roster based on ensemble selection
function getEventRoster(event) {
    const maestroId = event.maestroId;
    return state.members.filter(m => {
        if (m.isDeleted) return false;
        if (m.id === maestroId) return false; // Maestro is displayed separately in spotlight

        if (event.ensembleType === 'band1') {
            return m.assignedBand === 'band1' || m.assignedBand === 'both';
        } else if (event.ensembleType === 'band2') {
            return m.assignedBand === 'band2' || m.assignedBand === 'both';
        } else if (event.ensembleType === 'full') {
            return true;
        }
        return false;
    });
}

// Mark attendance status for a member
window.setAttendanceStatus = function(eventId, memberId, newStatus) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) return;

    if (!event.attendance) event.attendance = {};

    // Toggle off if already active
    if (event.attendance[memberId] === newStatus) {
        delete event.attendance[memberId];
        if (event.careOfDetails) delete event.careOfDetails[memberId];
    } else {
        event.attendance[memberId] = newStatus;
        if (event.careOfDetails && newStatus !== 'careof') {
            delete event.careOfDetails[memberId];
        }
    }

    saveState();
    apiSaveAttendance(event);
    renderActiveEventView();
    lucide.createIcons();
};

// Handle Care Of Button Click
window.handleCareOfClick = function(eventId, memberId) {
    const event = state.events.find(e => e.id === eventId);
    if (!event) return;

    if (!event.attendance) event.attendance = {};
    if (!event.careOfDetails) event.careOfDetails = {};

    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    document.getElementById('careof-member-id').value = memberId;
    document.getElementById('careof-musician-name').value = `${member.name} (${member.instrument})`;
    
    const existingCover = event.careOfDetails[memberId] || '';

    // Populate substitute options from other active members in the roster
    const otherMembers = state.members.filter(m => !m.isDeleted && m.id !== memberId);
    const subSelect = document.getElementById('careof-select-substitute');
    
    let matchedInSelect = false;
    subSelect.innerHTML = `<option value="">-- Choose Colleague from Band --</option>` + otherMembers.map(m => {
        const isSelected = existingCover && existingCover === m.name;
        if (isSelected) matchedInSelect = true;
        return `<option value="${escapeHtml(m.name)}" ${isSelected ? 'selected' : ''}>${escapeHtml(m.name)} (${escapeHtml(m.instrument)} - ${getBandLabel(m.assignedBand)})</option>`;
    }).join('');

    // If existingCover was a custom external name
    if (existingCover && !matchedInSelect) {
        document.getElementById('careof-custom-name').value = existingCover;
    } else {
        document.getElementById('careof-custom-name').value = '';
    }

    // Show/hide remove button based on current status
    const removeBtn = document.getElementById('btn-remove-careof');
    if (removeBtn) {
        removeBtn.style.display = event.attendance[memberId] === 'careof' ? 'flex' : 'none';
    }

    document.getElementById('modal-careof').classList.remove('hidden');
};

// ----------------------------------------------------
// TAB 2: HISTORICAL EVENTS & REPORTS (Story 4)
// ----------------------------------------------------
function renderHistoryView() {
    const listContainer = document.getElementById('history-events-list');
    let filteredEvents = [...state.events];

    // Filter by Ensemble Type
    if (state.historyFilters.bandType !== 'all') {
        filteredEvents = filteredEvents.filter(e => e.ensembleType === state.historyFilters.bandType);
    }

    // Filter by Maestro
    if (state.historyFilters.maestro !== 'all') {
        filteredEvents = filteredEvents.filter(e => e.maestroId === state.historyFilters.maestro);
    }

    // Filter by Date Range
    const now = new Date();
    if (state.historyFilters.dateRange === '30days') {
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        filteredEvents = filteredEvents.filter(e => new Date(e.date) >= thirtyDaysAgo);
    } else if (state.historyFilters.dateRange === '90days') {
        const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
        filteredEvents = filteredEvents.filter(e => new Date(e.date) >= ninetyDaysAgo);
    } else if (state.historyFilters.dateRange === 'upcoming') {
        filteredEvents = filteredEvents.filter(e => new Date(e.date) >= new Date(now.toISOString().split('T')[0]));
    } else if (state.historyFilters.dateRange === 'past') {
        filteredEvents = filteredEvents.filter(e => new Date(e.date) < new Date(now.toISOString().split('T')[0]));
    }

    // Sort chronologically (Newest first)
    filteredEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredEvents.length === 0) {
        listContainer.innerHTML = `<p class="view-desc" style="text-align: center; padding: 30px 0;">No past events match the specified filter criteria.</p>`;
        return;
    }

    listContainer.innerHTML = filteredEvents.map(evt => {
        const roster = getEventRoster(evt);
        const maestroObj = state.members.find(m => m.id === evt.maestroId);
        const allParticipants = maestroObj ? [maestroObj, ...roster] : roster;
        
        let pCount = 0, aCount = 0, lCount = 0, cCount = 0;
        allParticipants.forEach(p => {
            const st = evt.attendance ? evt.attendance[p.id] : null;
            if (st === 'present') pCount++;
            else if (st === 'absent') aCount++;
            else if (st === 'leave') lCount++;
            else if (st === 'careof') cCount++;
        });

        const turnout = allParticipants.length > 0 ? Math.round(((pCount + cCount) / allParticipants.length) * 100) : 0;

        return `
            <div class="history-card">
                <div class="history-card-header">
                    <div>
                        <h4 class="history-title">${escapeHtml(evt.title)}</h4>
                        <span class="view-desc">${formatDate(evt.date)} &bull; ${evt.callTime} &bull; ${escapeHtml(evt.venue)}</span>
                    </div>
                    <span class="ensemble-badge badge-${evt.ensembleType}">${getEnsembleLabel(evt.ensembleType)}</span>
                </div>

                <div class="history-stats-pill-row">
                    <span class="history-pill turnout">Turnout: ${turnout}%</span>
                    <span class="history-pill present">✅ ${pCount} Present</span>
                    <span class="history-pill absent">❌ ${aCount} Absent</span>
                    <span class="history-pill leave">⏳ ${lCount} Leave</span>
                    <span class="history-pill careof">🔄 ${cCount} Care Of</span>
                </div>

                <div class="history-card-actions">
                    <button class="sm-btn" onclick="openEventAttendance('${evt.id}')">
                        <i data-lucide="clipboard-check"></i> Open & Edit
                    </button>
                    <button class="sm-btn" onclick="copySingleEventReport('${evt.id}')">
                        <i data-lucide="share-2"></i> Report
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// ----------------------------------------------------
// TAB 3: BAND & ROSTER MANAGEMENT (CRUD) (Story 1)
// ----------------------------------------------------
function renderRosterView() {
    const listContainer = document.getElementById('manage-musicians-list');
    let filtered = state.members.filter(m => !m.isDeleted);

    // Filter by Band tab
    if (state.rosterFilter !== 'all') {
        filtered = filtered.filter(m => m.assignedBand === state.rosterFilter || m.assignedBand === 'both');
    }

    // Filter by Search Query
    if (state.rosterSearch.trim() !== '') {
        const q = state.rosterSearch.toLowerCase();
        filtered = filtered.filter(m => 
            m.name.toLowerCase().includes(q) || 
            m.instrument.toLowerCase().includes(q) ||
            (m.contact && m.contact.toLowerCase().includes(q))
        );
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `<p class="view-desc" style="text-align: center; padding: 20px 0;">No musicians found.</p>`;
        return;
    }

    listContainer.innerHTML = filtered.map(m => `
        <div class="member-crud-card">
            <div class="member-crud-info">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="member-name">${escapeHtml(m.name)}</span>
                    ${m.isMaestro ? '<i data-lucide="crown" style="width:14px; height:14px; color:gold;"></i>' : ''}
                </div>
                <div class="member-meta-tags">
                    <span class="section-tag">${escapeHtml(m.instrument)}</span>
                    <span>&bull;</span>
                    <span class="view-desc">${getBandLabel(m.assignedBand)}</span>
                    ${m.contact ? `<span>&bull;</span> <span class="view-desc">${escapeHtml(m.contact)}</span>` : ''}
                </div>
            </div>
            <div class="crud-actions">
                <button class="icon-action-btn" onclick="openEditMusicianModal('${m.id}')" title="Edit Musician">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="icon-action-btn delete-icon" onclick="deleteMusician('${m.id}')" title="Delete Musician">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Soft-delete musician (Preserves historical attendance records)
window.deleteMusician = function(memberId) {
    const member = state.members.find(m => m.id === memberId);
    if (!member) return;

    // Check if member has historical records
    const hasHistory = state.events.some(evt => evt.attendance && evt.attendance[memberId]);

    const confirmMsg = hasHistory 
        ? `"${member.name}" has recorded attendance in past events. Removing them will archive their profile while preserving historical reports. Proceed?`
        : `Are you sure you want to remove "${member.name}" from the band roster?`;

    if (confirm(confirmMsg)) {
        member.isDeleted = true; // Soft Delete
        saveState();
        apiDeleteMember(memberId);
        renderAll();
        showToast('Musician archived successfully.');
    }
};

// ----------------------------------------------------
// Event Scheduling & Modal Handlers (Story 2)
// ----------------------------------------------------
function setupEventListeners() {
    // Bottom Tab Navigation Switcher
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            state.currentTab = target;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
            document.getElementById(target).classList.remove('hidden');

            renderAll();
        });
    });

    // Active Event Switcher
    const activeEventSelect = document.getElementById('active-event-select');
    if (activeEventSelect) {
        activeEventSelect.addEventListener('change', (e) => {
            state.activeEventId = e.target.value;
            renderActiveEventView();
            lucide.createIcons();
        });
    }

    // Quick New Event Button
    document.getElementById('btn-quick-new-event').addEventListener('click', () => openNewEventModal());

    // Mark All Present Shortcut
    document.getElementById('btn-mark-all-present').addEventListener('click', () => {
        const activeEvent = state.events.find(e => e.id === state.activeEventId);
        if (!activeEvent) return;

        if (!activeEvent.attendance) activeEvent.attendance = {};
        const roster = getEventRoster(activeEvent);
        const maestroObj = state.members.find(m => m.id === activeEvent.maestroId);
        
        if (maestroObj) activeEvent.attendance[maestroObj.id] = 'present';
        roster.forEach(m => {
            activeEvent.attendance[m.id] = 'present';
        });

        saveState();
        apiSaveAttendance(activeEvent);
        renderActiveEventView();
        lucide.createIcons();
        showToast('All roster members marked Present!');
    });

    // Save Attendance Button
    document.getElementById('btn-save-attendance').addEventListener('click', () => {
        const activeEvent = state.events.find(e => e.id === state.activeEventId);
        if (activeEvent) {
            activeEvent.status = 'completed';
            saveState();
            apiSaveAttendance(activeEvent);
            showToast('Event attendance successfully saved!');
        }
    });

    // Share / Copy Report Button
    document.getElementById('btn-copy-report').addEventListener('click', () => {
        copySingleEventReport(state.activeEventId);
    });

    // Attendance Live Search
    document.getElementById('roster-search').addEventListener('input', (e) => {
        state.attendanceSearch = e.target.value;
        renderActiveEventView();
        lucide.createIcons();
    });

    // Primary Maestro change handlers
    document.getElementById('select-band1-maestro').addEventListener('change', (e) => {
        state.config.band1MaestroId = e.target.value;
        saveState();
        apiSaveConfig(state.config);
        showToast('Band 1 Primary Maestro updated.');
    });

    document.getElementById('select-band2-maestro').addEventListener('change', (e) => {
        state.config.band2MaestroId = e.target.value;
        saveState();
        apiSaveConfig(state.config);
        showToast('Band 2 Primary Maestro updated.');
    });

    // Roster Band Pill filters
    document.querySelectorAll('.pill-btn').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.rosterFilter = e.currentTarget.getAttribute('data-roster-filter');
            renderRosterView();
            lucide.createIcons();
        });
    });

    // Roster Search Input
    document.getElementById('manage-roster-search').addEventListener('input', (e) => {
        state.rosterSearch = e.target.value;
        renderRosterView();
        lucide.createIcons();
    });

    // Add Musician Button
    document.getElementById('btn-add-musician').addEventListener('click', () => openNewMusicianModal());

    // History Filters
    document.getElementById('filter-band-type').addEventListener('change', (e) => {
        state.historyFilters.bandType = e.target.value;
        renderHistoryView();
        lucide.createIcons();
    });

    document.getElementById('filter-maestro').addEventListener('change', (e) => {
        state.historyFilters.maestro = e.target.value;
        renderHistoryView();
        lucide.createIcons();
    });

    document.getElementById('filter-date-range').addEventListener('change', (e) => {
        state.historyFilters.dateRange = e.target.value;
        renderHistoryView();
        lucide.createIcons();
    });

    // Modal Close Buttons
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.currentTarget.getAttribute('data-close');
            document.getElementById(modalId).classList.add('hidden');
        });
    });

    // Ensemble type change in event modal (Conditional Designated Maestro for Full Band)
    const ensembleSelect = document.getElementById('event-input-band');
    ensembleSelect.addEventListener('change', (e) => {
        const fullMaestroGroup = document.getElementById('full-band-maestro-group');
        if (e.target.value === 'full') {
            fullMaestroGroup.classList.remove('hidden');
        } else {
            fullMaestroGroup.classList.add('hidden');
        }
    });

    // Event Form Submission
    document.getElementById('form-event').addEventListener('submit', handleEventFormSubmit);

    // Musician Form Submission
    document.getElementById('form-musician').addEventListener('submit', handleMusicianFormSubmit);

    // Care Of (Substitute) Form Submission
    const formCareOf = document.getElementById('form-careof');
    if (formCareOf) {
        formCareOf.addEventListener('submit', (e) => {
            e.preventDefault();
            const memberId = document.getElementById('careof-member-id').value;
            const selectVal = document.getElementById('careof-select-substitute').value;
            const customVal = document.getElementById('careof-custom-name').value.trim();
            const coveringName = customVal || selectVal;

            if (!coveringName) {
                alert('Please select a colleague or enter a substitute name.');
                return;
            }

            const activeEvent = state.events.find(evt => evt.id === state.activeEventId);
            if (activeEvent && memberId) {
                if (!activeEvent.attendance) activeEvent.attendance = {};
                if (!activeEvent.careOfDetails) activeEvent.careOfDetails = {};
                
                activeEvent.attendance[memberId] = 'careof';
                activeEvent.careOfDetails[memberId] = coveringName;

                saveState();
                apiSaveAttendance(activeEvent);
                renderActiveEventView();
                lucide.createIcons();
                document.getElementById('modal-careof').classList.add('hidden');
                showToast(`Marked Care Of by ${coveringName}`);
            }
        });
    }

    // Remove Care Of Button Handler
    const btnRemoveCareOf = document.getElementById('btn-remove-careof');
    if (btnRemoveCareOf) {
        btnRemoveCareOf.addEventListener('click', () => {
            const memberId = document.getElementById('careof-member-id').value;
            const activeEvent = state.events.find(evt => evt.id === state.activeEventId);
            if (activeEvent && memberId) {
                if (activeEvent.attendance) delete activeEvent.attendance[memberId];
                if (activeEvent.careOfDetails) delete activeEvent.careOfDetails[memberId];

                saveState();
                apiSaveAttendance(activeEvent);
                renderActiveEventView();
                lucide.createIcons();
                document.getElementById('modal-careof').classList.add('hidden');
                showToast('Care Of status removed.');
            }
        });
    }
}

// Open and populate Event modal for creation
function openNewEventModal() {
    document.getElementById('modal-event-title').textContent = 'Schedule New Event';
    document.getElementById('event-form-id').value = '';
    document.getElementById('event-input-title').value = '';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-input-date').value = today;
    document.getElementById('event-input-time').value = '18:00';
    document.getElementById('event-input-venue').value = '';
    document.getElementById('event-input-band').value = 'band1';
    
    document.getElementById('full-band-maestro-group').classList.add('hidden');
    document.getElementById('modal-event').classList.remove('hidden');
}

// Open and populate Event modal for editing
window.openEditEventModal = function(eventId) {
    const evt = state.events.find(e => e.id === eventId);
    if (!evt) return;

    document.getElementById('modal-event-title').textContent = 'Edit Event Details';
    document.getElementById('event-form-id').value = evt.id;
    document.getElementById('event-input-title').value = evt.title;
    document.getElementById('event-input-date').value = evt.date;
    document.getElementById('event-input-time').value = evt.callTime;
    document.getElementById('event-input-venue').value = evt.venue;
    document.getElementById('event-input-band').value = evt.ensembleType;

    const fullMaestroGroup = document.getElementById('full-band-maestro-group');
    if (evt.ensembleType === 'full') {
        fullMaestroGroup.classList.remove('hidden');
        document.getElementById('event-input-maestro').value = evt.maestroId;
    } else {
        fullMaestroGroup.classList.add('hidden');
    }

    document.getElementById('modal-event').classList.remove('hidden');
};

function handleEventFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('event-form-id').value;
    const title = document.getElementById('event-input-title').value.trim();
    const date = document.getElementById('event-input-date').value;
    const callTime = document.getElementById('event-input-time').value;
    const venue = document.getElementById('event-input-venue').value.trim();
    const ensembleType = document.getElementById('event-input-band').value;

    let maestroId = '';
    if (ensembleType === 'band1') {
        maestroId = state.config.band1MaestroId;
    } else if (ensembleType === 'band2') {
        maestroId = state.config.band2MaestroId;
    } else if (ensembleType === 'full') {
        maestroId = document.getElementById('event-input-maestro').value;
    }

    if (id) {
        // Edit existing event
        const evt = state.events.find(e => e.id === id);
        if (evt) {
            evt.title = title;
            evt.date = date;
            evt.callTime = callTime;
            evt.venue = venue;
            evt.ensembleType = ensembleType;
            evt.maestroId = maestroId;
            saveState();
            apiSaveEvent(evt, false);
        }
        showToast('Event updated successfully!');
    } else {
        // Create new event
        const newEvent = {
            id: 'evt_' + Date.now(),
            title,
            date,
            callTime,
            venue,
            ensembleType,
            maestroId,
            attendance: {},
            careOfDetails: {},
            status: 'scheduled'
        };
        state.events.unshift(newEvent);
        state.activeEventId = newEvent.id;
        saveState();
        apiSaveEvent(newEvent, true);
        showToast('New event scheduled!');
    }

    document.getElementById('modal-event').classList.add('hidden');
    renderAll();
}

// Musician Form Handlers (Story 1 CRUD)
function openNewMusicianModal() {
    document.getElementById('modal-musician-title').textContent = 'Add New Musician';
    document.getElementById('musician-form-id').value = '';
    document.getElementById('musician-input-name').value = '';
    document.getElementById('musician-input-instrument').value = '';
    document.getElementById('musician-input-band').value = 'band1';
    document.getElementById('musician-input-contact').value = '';
    document.getElementById('musician-input-maestro').checked = false;
    document.getElementById('modal-musician').classList.remove('hidden');
}

window.openEditMusicianModal = function(memberId) {
    const mem = state.members.find(m => m.id === memberId);
    if (!mem) return;

    document.getElementById('modal-musician-title').textContent = 'Edit Musician Details';
    document.getElementById('musician-form-id').value = mem.id;
    document.getElementById('musician-input-name').value = mem.name;
    document.getElementById('musician-input-instrument').value = mem.instrument;
    document.getElementById('musician-input-band').value = mem.assignedBand;
    document.getElementById('musician-input-contact').value = mem.contact || '';
    document.getElementById('musician-input-maestro').checked = !!mem.isMaestro;
    document.getElementById('modal-musician').classList.remove('hidden');
};

function handleMusicianFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('musician-form-id').value;
    const name = document.getElementById('musician-input-name').value.trim();
    const instrument = document.getElementById('musician-input-instrument').value.trim();
    const assignedBand = document.getElementById('musician-input-band').value;
    const contact = document.getElementById('musician-input-contact').value.trim();
    const isMaestro = document.getElementById('musician-input-maestro').checked;

    if (id) {
        const mem = state.members.find(m => m.id === id);
        if (mem) {
            mem.name = name;
            mem.instrument = instrument;
            mem.assignedBand = assignedBand;
            mem.contact = contact;
            mem.isMaestro = isMaestro;
            saveState();
            apiSaveMember(mem, false);
        }
        showToast('Musician details updated!');
    } else {
        const newMember = {
            id: 'mem_' + Date.now(),
            name,
            instrument,
            assignedBand,
            contact,
            isMaestro,
            isDeleted: false
        };
        state.members.push(newMember);
        saveState();
        apiSaveMember(newMember, true);
        showToast('New musician added to roster!');
    }

    document.getElementById('modal-musician').classList.add('hidden');
    renderAll();
}

// Switch directly from History to Attendance tab for a specific event
window.openEventAttendance = function(eventId) {
    state.activeEventId = eventId;
    state.currentTab = 'view-events';

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector('.nav-item[data-target="view-events"]').classList.add('active');

    document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
    document.getElementById('view-events').classList.remove('hidden');

    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ----------------------------------------------------
// Export / Share Report Generator (Story 4)
// ----------------------------------------------------
window.copySingleEventReport = function(eventId) {
    const evt = state.events.find(e => e.id === eventId);
    if (!evt) return;

    const roster = getEventRoster(evt);
    const maestroObj = state.members.find(m => m.id === evt.maestroId);
    const allParticipants = maestroObj ? [maestroObj, ...roster] : roster;

    let pList = [], aList = [], lList = [], cList = [], uList = [];
    allParticipants.forEach(p => {
        const status = evt.attendance ? evt.attendance[p.id] : null;
        const coveredBy = (evt.careOfDetails && evt.careOfDetails[p.id]) || '';
        const line = `${p.name} (${p.instrument})`;
        
        if (status === 'present') pList.push(line);
        else if (status === 'absent') aList.push(line);
        else if (status === 'leave') lList.push(line);
        else if (status === 'careof') cList.push(`${line} — C/O ${coveredBy || 'Substitute'}`);
        else uList.push(line);
    });

    const turnout = allParticipants.length > 0 ? Math.round(((pList.length + cList.length) / allParticipants.length) * 100) : 0;

    let report = `🎼 *BAND ATTENDANCE REPORT*\n`;
    report += `📌 *Event:* ${evt.title}\n`;
    report += `📅 *Date:* ${formatDate(evt.date)} | ⏰ *Call:* ${evt.callTime}\n`;
    report += `📍 *Venue:* ${evt.venue}\n`;
    report += `🎺 *Ensemble:* ${getEnsembleLabel(evt.ensembleType)}\n`;
    report += `👑 *Maestro:* ${maestroObj ? maestroObj.name : 'N/A'}\n`;
    report += `📊 *Turnout:* ${turnout}% (${pList.length + cList.length}/${allParticipants.length})\n\n`;

    report += `✅ *PRESENT (${pList.length}):*\n` + (pList.length ? pList.map(i => `  • ${i}`).join('\n') : '  None') + '\n\n';
    report += `🔄 *CARE OF (${cList.length}):*\n` + (cList.length ? cList.map(i => `  • ${i}`).join('\n') : '  None') + '\n\n';
    report += `⏳ *ON LEAVE (${lList.length}):*\n` + (lList.length ? lList.map(i => `  • ${i}`).join('\n') : '  None') + '\n\n';
    report += `❌ *ABSENT (${aList.length}):*\n` + (aList.length ? aList.map(i => `  • ${i}`).join('\n') : '  None') + '\n\n';
    if (uList.length > 0) {
        report += `⚪ *UNMARKED (${uList.length}):*\n` + uList.map(i => `  • ${i}`).join('\n') + '\n';
    }

    copyToClipboard(report);
};

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Summary report copied to clipboard!');
        }).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast('Summary report copied to clipboard!');
    } catch (err) {
        showToast('Could not copy report.');
    }
    document.body.removeChild(textArea);
}

// ----------------------------------------------------
// UI Helpers
// ----------------------------------------------------
function renderNavigation() {
    document.querySelectorAll('.tab-view').forEach(v => {
        if (v.id === state.currentTab) v.classList.remove('hidden');
        else v.classList.add('hidden');
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function getEnsembleLabel(type) {
    switch (type) {
        case 'band1': return 'Band 1';
        case 'band2': return 'Band 2';
        case 'full': return 'Full Band';
        default: return type;
    }
}

function getBandLabel(band) {
    switch (band) {
        case 'band1': return 'Band 1';
        case 'band2': return 'Band 2';
        case 'both': return 'Full / Both Bands';
        default: return band;
    }
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2800);
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
