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
    attendanceSort: 'name-asc',
    rosterSort: 'name-asc',
    isAttendanceEditing: false,
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

    // Update Mode Status Bar & Controls
    const isEditing = !!state.isAttendanceEditing;
    const modeBadge = document.getElementById('attendance-mode-badge');
    const toggleEditBtn = document.getElementById('btn-toggle-edit-mode');
    const markAllBtn = document.getElementById('btn-mark-all-present');
    const saveBtn = document.getElementById('btn-save-attendance');

    if (modeBadge) {
        if (isEditing) {
            modeBadge.innerHTML = `<i data-lucide="unlock" style="width:11px; height:11px; color:#a5b4fc;"></i> <span style="color:#c7d2fe;">Roll Call Active (Editing)</span>`;
            modeBadge.style.background = 'rgba(99, 102, 241, 0.2)';
            modeBadge.style.borderColor = 'rgba(99, 102, 241, 0.4)';
        } else {
            modeBadge.innerHTML = `<i data-lucide="lock" style="width:11px; height:11px;"></i> Read-Only View`;
            modeBadge.style.background = 'rgba(255, 255, 255, 0.06)';
            modeBadge.style.borderColor = 'transparent';
        }
    }

    if (toggleEditBtn) {
        if (isEditing) {
            toggleEditBtn.innerHTML = `<i data-lucide="check" style="width:13px; height:13px;"></i> <span>Done Editing</span>`;
            toggleEditBtn.style.background = 'rgba(16, 185, 129, 0.2)';
            toggleEditBtn.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            toggleEditBtn.style.color = '#34d399';
        } else {
            toggleEditBtn.innerHTML = `<i data-lucide="edit-3" style="width:13px; height:13px;"></i> <span>Edit Attendance</span>`;
            toggleEditBtn.style.background = 'var(--primary-grad)';
            toggleEditBtn.style.border = 'none';
            toggleEditBtn.style.color = '#ffffff';
        }
    }

    if (markAllBtn) {
        if (isEditing) markAllBtn.classList.remove('hidden');
        else markAllBtn.classList.add('hidden');
    }

    if (saveBtn) {
        if (isEditing) {
            saveBtn.innerHTML = `<i data-lucide="save" style="width:15px; height:15px;"></i> <span>Done & Save Attendance</span>`;
        } else {
            saveBtn.innerHTML = `<i data-lucide="edit-3" style="width:15px; height:15px;"></i> <span>Take Roll Call / Edit</span>`;
        }
    }

    // Compute Active Roster for this Event
    const assignedMembers = getEventRoster(activeEvent);
    countBadge.textContent = assignedMembers.length;

    // Helper for Read-Only Status Badge
    function getStatusBadge(status, coveredBy) {
        if (status === 'present') {
            return `<span class="read-status-badge present"><i data-lucide="check-circle-2"></i> Present</span>`;
        } else if (status === 'absent') {
            return `<span class="read-status-badge absent"><i data-lucide="x-circle"></i> Absent</span>`;
        } else if (status === 'leave') {
            return `<span class="read-status-badge leave"><i data-lucide="clock-4"></i> On Leave</span>`;
        } else if (status === 'careof') {
            return `<span class="read-status-badge careof"><i data-lucide="refresh-cw"></i> C/O: ${escapeHtml(coveredBy || 'Covered')}</span>`;
        }
        return `<span class="read-status-badge unmarked"><i data-lucide="circle-dashed"></i> Unmarked</span>`;
    }

    // Maestro Row
    if (maestroObj) {
        const maestroStatus = activeEvent.attendance[maestroObj.id] || '';
        const coveredBy = (activeEvent.careOfDetails && activeEvent.careOfDetails[maestroObj.id]) || '';

        if (isEditing) {
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
            maestroCard.innerHTML = `
                <div class="member-info-row" style="align-items: center;">
                    <div class="member-name-tag">
                        <span class="member-name">${escapeHtml(maestroObj.name)}</span>
                        <span class="member-sub"><i data-lucide="crown" style="width:12px; height:12px; color:gold; display:inline;"></i> Conductor / Maestro</span>
                    </div>
                    ${getStatusBadge(maestroStatus, coveredBy)}
                </div>
            `;
        }
    } else {
        maestroCard.innerHTML = `<p class="view-desc">No designated maestro for this event.</p>`;
    }

    // Coordinators Section
    const coordContainer = document.getElementById('event-coordinators-list');
    const coordBadge = document.getElementById('coordinator-count-badge');
    const coordinatorObjs = (activeEvent.coordinatorIds || [])
        .map(id => state.members.find(m => m.id === id && !m.isDeleted))
        .filter(Boolean);

    if (coordBadge) coordBadge.textContent = coordinatorObjs.length;

    if (coordContainer) {
        if (coordinatorObjs.length === 0) {
            coordContainer.innerHTML = `<p class="view-desc" style="padding: 4px 0; font-style: italic;">No coordinator designated for this event.</p>`;
        } else {
            coordContainer.innerHTML = coordinatorObjs.map(c => {
                const cStatus = activeEvent.attendance[c.id] || '';
                const coveredBy = (activeEvent.careOfDetails && activeEvent.careOfDetails[c.id]) || '';

                if (isEditing) {
                    return `
                        <div class="coordinator-card">
                            <div class="member-info-row">
                                <div class="member-name-tag">
                                    <span class="member-name">${escapeHtml(c.name)}</span>
                                    <span class="member-sub"><span class="badge-coordinator"><i data-lucide="shield-check" style="width:10px;height:10px;"></i> Coordinator</span> &bull; ${escapeHtml(c.instrument)}</span>
                                    ${cStatus === 'careof' ? `<span class="careof-badge" style="cursor:pointer;" onclick="handleCareOfClick('${activeEvent.id}', '${c.id}')"><i data-lucide="refresh-cw" style="width:11px; height:11px;"></i> C/O: ${escapeHtml(coveredBy)} (Edit)</span>` : ''}
                                </div>
                            </div>
                            <div class="attendance-actions">
                                <button class="att-btn present ${cStatus === 'present' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${c.id}', 'present')">
                                    <i data-lucide="check-circle-2"></i> Present
                                </button>
                                <button class="att-btn absent ${cStatus === 'absent' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${c.id}', 'absent')">
                                    <i data-lucide="x-circle"></i> Absent
                                </button>
                                <button class="att-btn leave ${cStatus === 'leave' ? 'active' : ''}" onclick="setAttendanceStatus('${activeEvent.id}', '${c.id}', 'leave')">
                                    <i data-lucide="clock-4"></i> Leave
                                </button>
                                <button class="att-btn careof ${cStatus === 'careof' ? 'active' : ''}" onclick="handleCareOfClick('${activeEvent.id}', '${c.id}')">
                                    <i data-lucide="refresh-cw"></i> C/O
                                </button>
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="coordinator-card">
                            <div class="member-info-row" style="align-items: center;">
                                <div class="member-name-tag">
                                    <span class="member-name">${escapeHtml(c.name)}</span>
                                    <span class="member-sub"><span class="badge-coordinator"><i data-lucide="shield-check" style="width:10px;height:10px;"></i> Coordinator</span> &bull; ${escapeHtml(c.instrument)}</span>
                                </div>
                                ${getStatusBadge(cStatus, coveredBy)}
                            </div>
                        </div>
                    `;
                }
            }).join('');
        }
    }

    // Filter roster by search
    let filteredRoster = assignedMembers.filter(m => {
        const q = state.attendanceSearch.toLowerCase();
        return m.name.toLowerCase().includes(q) || m.instrument.toLowerCase().includes(q);
    });

    // Sort Musicians (Maestro & Coordinators remain spotlighted above)
    filteredRoster.sort((a, b) => {
        if (state.attendanceSort === 'name-asc') {
            return a.name.localeCompare(b.name);
        } else if (state.attendanceSort === 'name-desc') {
            return b.name.localeCompare(a.name);
        } else if (state.attendanceSort === 'instrument-asc') {
            return a.instrument.localeCompare(b.instrument) || a.name.localeCompare(b.name);
        }
        return 0;
    });

    // Render Musicians Roster
    if (filteredRoster.length === 0) {
        rosterList.innerHTML = `<p class="view-desc" style="text-align:center; padding: 20px 0;">No musicians found matching query.</p>`;
    } else {
        rosterList.innerHTML = filteredRoster.map(m => {
            const status = activeEvent.attendance[m.id] || '';
            const coveredBy = (activeEvent.careOfDetails && activeEvent.careOfDetails[m.id]) || '';

            if (isEditing) {
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
            } else {
                return `
                    <div class="roster-card">
                        <div class="member-info-row" style="align-items: center;">
                            <div class="member-name-tag">
                                <span class="member-name">${escapeHtml(m.name)}</span>
                                <span class="member-sub">${escapeHtml(m.instrument)} &bull; ${getBandLabel(m.assignedBand)}</span>
                            </div>
                            ${getStatusBadge(status, coveredBy)}
                        </div>
                    </div>
                `;
            }
        }).join('');
    }

    // Calculate Summary Stats for this Event (Including Maestro & Coordinators)
    const allParticipants = [
        ...(maestroObj ? [maestroObj] : []),
        ...coordinatorObjs,
        ...assignedMembers
    ];
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

// Get assigned roster based on ensemble selection (Excludes Maestro and Coordinators who have spotlight sections)
function getEventRoster(event) {
    const maestroId = event.maestroId;
    const coordIds = new Set(event.coordinatorIds || []);
    return state.members.filter(m => {
        if (m.isDeleted) return false;
        if (m.id === maestroId) return false; // Maestro is displayed separately in spotlight
        if (coordIds.has(m.id)) return false; // Coordinators are displayed in coordinator section

        if (event.ensembleType === 'band1') {
            return m.assignedBand === 'band1' || m.assignedBand === 'both';
        } else if (event.ensembleType === 'band2') {
            return m.assignedBand === 'band2' || m.assignedBand === 'both';
        } else if (event.ensembleType === 'custom') {
            return Array.isArray(event.customMemberIds) && event.customMemberIds.includes(m.id);
        } else if (event.ensembleType === 'full') {
            return true;
        }
        return true;
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
        const coordinatorObjs = (evt.coordinatorIds || [])
            .map(id => state.members.find(m => m.id === id && !m.isDeleted))
            .filter(Boolean);
        const allParticipants = [
            ...(maestroObj ? [maestroObj] : []),
            ...coordinatorObjs,
            ...roster
        ];
        
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
    const activeMembers = state.members.filter(m => !m.isDeleted);

    // Compute live category counts
    const fullBandCount = activeMembers.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator').length;
    const band1Count = activeMembers.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band1' || m.assignedBand === 'both')).length;
    const band2Count = activeMembers.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band2' || m.assignedBand === 'both')).length;
    const coordCount = activeMembers.filter(m => m.isCoordinator || m.assignedBand === 'coordinator').length;

    // Update pill tab button labels with counts
    const pillAll = document.querySelector('.pill-btn[data-roster-filter="all"]');
    const pillB1 = document.querySelector('.pill-btn[data-roster-filter="band1"]');
    const pillB2 = document.querySelector('.pill-btn[data-roster-filter="band2"]');
    const pillCoord = document.querySelector('.pill-btn[data-roster-filter="coordinators"]');

    if (pillAll) pillAll.innerHTML = `Full Band <span style="opacity:0.8; font-size:10px;">(${fullBandCount})</span>`;
    if (pillB1) pillB1.innerHTML = `Band 1 <span style="opacity:0.8; font-size:10px;">(${band1Count})</span>`;
    if (pillB2) pillB2.innerHTML = `Band 2 <span style="opacity:0.8; font-size:10px;">(${band2Count})</span>`;
    if (pillCoord) pillCoord.innerHTML = `<i data-lucide="shield-check" style="width:12px;height:12px;display:inline;vertical-align:middle;"></i> Coordinators <span style="opacity:0.8; font-size:10px;">(${coordCount})</span>`;

    let filtered = [...activeMembers];

    // Filter by Tab: Coordinators have their own dedicated tab and are separated from Full Band & Band 1/2
    if (state.rosterFilter === 'coordinators') {
        filtered = filtered.filter(m => m.isCoordinator || m.assignedBand === 'coordinator');
    } else if (state.rosterFilter === 'band1') {
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band1' || m.assignedBand === 'both'));
    } else if (state.rosterFilter === 'band2') {
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band2' || m.assignedBand === 'both'));
    } else {
        // 'all' / Full Band: Only playing musicians in Full Band, excluding Coordinators
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator');
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

    // Sort Roster
    filtered.sort((a, b) => {
        if (state.rosterSort === 'name-asc') {
            return a.name.localeCompare(b.name);
        } else if (state.rosterSort === 'name-desc') {
            return b.name.localeCompare(a.name);
        } else if (state.rosterSort === 'instrument-asc') {
            return a.instrument.localeCompare(b.instrument) || a.name.localeCompare(b.name);
        }
        return 0;
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = `<p class="view-desc" style="text-align: center; padding: 20px 0;">No members found in this section.</p>`;
        return;
    }

    listContainer.innerHTML = filtered.map(m => `
        <div class="member-crud-card">
            <div class="member-crud-info">
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="member-name">${escapeHtml(m.name)}</span>
                    ${m.isMaestro ? '<i data-lucide="crown" style="width:13px; height:13px; color:gold;" title="Conductor / Maestro"></i>' : ''}
                    ${(m.isCoordinator || m.assignedBand === 'coordinator') ? '<span class="badge-coordinator"><i data-lucide="shield-check" style="width:10px; height:10px;"></i> Coordinator</span>' : ''}
                </div>
                <div class="member-meta-tags">
                    <span class="section-tag">${escapeHtml(m.instrument)}</span>
                    <span>&bull;</span>
                    <span class="view-desc">${getBandLabel(m.assignedBand)}</span>
                    ${m.contact ? `<span>&bull;</span> <span class="view-desc">${escapeHtml(m.contact)}</span>` : ''}
                </div>
            </div>
            <div class="crud-actions">
                <button class="icon-action-btn" onclick="openEditMusicianModal('${m.id}')" title="Edit Member">
                    <i data-lucide="edit-2"></i>
                </button>
                <button class="icon-action-btn delete-icon" onclick="deleteMusician('${m.id}')" title="Delete Member">
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
            state.isAttendanceEditing = false; // Always default to read-only when switching events
            renderActiveEventView();
            lucide.createIcons();
        });
    }

    // Toggle Edit / Roll-Call Mode Button
    const btnToggleEdit = document.getElementById('btn-toggle-edit-mode');
    if (btnToggleEdit) {
        btnToggleEdit.addEventListener('click', () => {
            state.isAttendanceEditing = !state.isAttendanceEditing;
            renderActiveEventView();
            lucide.createIcons();
            if (state.isAttendanceEditing) {
                showToast('Roll Call mode enabled. You can now tap attendance buttons.');
            } else {
                showToast('Switched to Read-Only view.');
            }
        });
    }

    // Quick New Event Button
    document.getElementById('btn-quick-new-event').addEventListener('click', () => openNewEventModal());

    // Mark All Present Shortcut
    const btnMarkAll = document.getElementById('btn-mark-all-present');
    btnMarkAll.addEventListener('click', () => {
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

    // Save Attendance / Take Roll Call Action Button
    const btnSaveAtt = document.getElementById('btn-save-attendance');
    btnSaveAtt.addEventListener('click', () => {
        const activeEvent = state.events.find(e => e.id === state.activeEventId);
        if (!activeEvent) return;

        if (!state.isAttendanceEditing) {
            // If in Read-Only view, clicking button enters editing mode
            state.isAttendanceEditing = true;
            renderActiveEventView();
            lucide.createIcons();
            showToast('Roll Call mode enabled. You can now tap attendance buttons.');
            return;
        }

        // If in Editing mode, save changes and return to Read-Only view
        btnSaveAtt.classList.add('btn-processing');
        btnSaveAtt.innerHTML = `<i data-lucide="check" style="width:15px;height:15px;color:#34d399;"></i> <span>Saved!</span>`;
        if (window.lucide) lucide.createIcons();

        activeEvent.status = 'completed';
        state.isAttendanceEditing = false; // Return to Read-Only mode after saving
        saveState();
        apiSaveAttendance(activeEvent);
        showToast('Event attendance successfully saved!');

        setTimeout(() => {
            renderActiveEventView();
            btnSaveAtt.classList.remove('btn-processing');
            if (window.lucide) lucide.createIcons();
        }, 1200);
    });

    // Share / Copy Report Button
    document.getElementById('btn-copy-report').addEventListener('click', () => {
        copySingleEventReport(state.activeEventId);
    });

    // Attendance Live Search & Sort
    document.getElementById('roster-search').addEventListener('input', (e) => {
        state.attendanceSearch = e.target.value;
        renderActiveEventView();
        lucide.createIcons();
    });

    const attendanceSortSelect = document.getElementById('attendance-sort-order');
    if (attendanceSortSelect) {
        attendanceSortSelect.addEventListener('change', (e) => {
            state.attendanceSort = e.target.value;
            renderActiveEventView();
            lucide.createIcons();
        });
    }

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

    // Roster Search & Sort Input
    document.getElementById('manage-roster-search').addEventListener('input', (e) => {
        state.rosterSearch = e.target.value;
        renderRosterView();
        lucide.createIcons();
    });

    const musicianBandSelect = document.getElementById('musician-input-band');
    if (musicianBandSelect) {
        musicianBandSelect.addEventListener('change', (e) => {
            const isCoord = e.target.value === 'coordinator';
            const coordCheckbox = document.getElementById('musician-input-coordinator');
            if (isCoord && coordCheckbox) coordCheckbox.checked = true;
        });
    }

    const rosterSortSelect = document.getElementById('roster-sort-order');
    if (rosterSortSelect) {
        rosterSortSelect.addEventListener('change', (e) => {
            state.rosterSort = e.target.value;
            renderRosterView();
            lucide.createIcons();
        });
    }

    // Add Musician Button
    const btnAddMusician = document.getElementById('btn-add-musician');
    if (btnAddMusician) {
        btnAddMusician.addEventListener('click', () => openNewMusicianModal());
    }

    // History Filters
    const filterBandType = document.getElementById('filter-band-type');
    if (filterBandType) {
        filterBandType.addEventListener('change', (e) => {
            state.historyFilters.bandType = e.target.value;
            renderHistoryView();
            lucide.createIcons();
        });
    }

    const filterMaestro = document.getElementById('filter-maestro');
    if (filterMaestro) {
        filterMaestro.addEventListener('change', (e) => {
            state.historyFilters.maestro = e.target.value;
            renderHistoryView();
            lucide.createIcons();
        });
    }

    const filterDateRange = document.getElementById('filter-date-range');
    if (filterDateRange) {
        filterDateRange.addEventListener('change', (e) => {
            state.historyFilters.dateRange = e.target.value;
            renderHistoryView();
            lucide.createIcons();
        });
    }

    // Modal Close Buttons with Smooth Animation
    document.querySelectorAll('.close-modal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.currentTarget.getAttribute('data-close');
            if (modalId) closeModal(modalId);
        });
    });

    // Close Modal on Backdrop Click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
    });

    // Ensemble type change in event modal (Conditional Custom Roster and Maestro)
    const ensembleSelect = document.getElementById('event-input-band');
    if (ensembleSelect) {
        ensembleSelect.addEventListener('change', (e) => {
            const fullMaestroGroup = document.getElementById('full-band-maestro-group');
            const customRosterGroup = document.getElementById('custom-roster-group');
            const val = e.target.value;

            if (val === 'custom') {
                if (customRosterGroup) customRosterGroup.classList.remove('hidden');
                if (fullMaestroGroup) fullMaestroGroup.classList.remove('hidden');
                renderCustomRosterChecklist(null);
            } else if (val === 'full') {
                if (customRosterGroup) customRosterGroup.classList.add('hidden');
                if (fullMaestroGroup) fullMaestroGroup.classList.remove('hidden');
            } else {
                if (customRosterGroup) customRosterGroup.classList.add('hidden');
                if (fullMaestroGroup) fullMaestroGroup.classList.add('hidden');
            }
        });
    }

    // Custom Roster Quick Action Buttons
    const btnSelectB1 = document.getElementById('btn-select-b1');
    if (btnSelectB1) {
        btnSelectB1.addEventListener('click', () => {
            const b1Ids = state.members.filter(m => !m.isDeleted && (m.assignedBand === 'band1' || m.assignedBand === 'both')).map(m => m.id);
            renderCustomRosterChecklist(b1Ids);
        });
    }

    const btnSelectB2 = document.getElementById('btn-select-b2');
    if (btnSelectB2) {
        btnSelectB2.addEventListener('click', () => {
            const b2Ids = state.members.filter(m => !m.isDeleted && (m.assignedBand === 'band2' || m.assignedBand === 'both')).map(m => m.id);
            renderCustomRosterChecklist(b2Ids);
        });
    }

    const btnSelectAllCustom = document.getElementById('btn-select-all-custom');
    if (btnSelectAllCustom) {
        btnSelectAllCustom.addEventListener('click', () => {
            const allIds = state.members.filter(m => !m.isDeleted).map(m => m.id);
            renderCustomRosterChecklist(allIds);
        });
    }

    const btnClearCustom = document.getElementById('btn-clear-custom');
    if (btnClearCustom) {
        btnClearCustom.addEventListener('click', () => {
            renderCustomRosterChecklist([]);
        });
    }

    const customSearchInput = document.getElementById('custom-roster-search');
    if (customSearchInput) {
        customSearchInput.addEventListener('input', (e) => {
            renderCustomRosterChecklist(null, e.target.value);
        });
    }

    // Coordinator search in event modal
    const coordSearchInput = document.getElementById('event-coordinator-search');
    if (coordSearchInput) {
        coordSearchInput.addEventListener('input', (e) => {
            renderEventCoordinatorChecklist(null, e.target.value);
        });
    }

    // Event Form Submission
    const formEvent = document.getElementById('form-event');
    if (formEvent) {
        formEvent.addEventListener('submit', handleEventFormSubmit);
    }

    // Musician Form Submission
    const formMusician = document.getElementById('form-musician');
    if (formMusician) {
        formMusician.addEventListener('submit', handleMusicianFormSubmit);
    }

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
                showToast('Please select a colleague or enter a substitute name.', 'error');
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
                closeModal('modal-careof');
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
                closeModal('modal-careof');
                showToast('Care Of status removed.');
            }
        });
    }
}

// Custom Roster Selection Helper
let customRosterSelectedIds = new Set();

function renderCustomRosterChecklist(selectedIds = null, filterText = '') {
    if (selectedIds !== null) {
        customRosterSelectedIds = new Set(selectedIds);
    }

    const container = document.getElementById('custom-roster-items');
    const countBadge = document.getElementById('custom-roster-count');
    if (!container) return;

    const activeMembers = state.members.filter(m => !m.isDeleted);
    let filtered = activeMembers;
    if (filterText && filterText.trim()) {
        const q = filterText.toLowerCase();
        filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || m.instrument.toLowerCase().includes(q));
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        container.innerHTML = `<p class="view-desc" style="text-align:center; padding: 10px 0;">No musicians found.</p>`;
    } else {
        container.innerHTML = filtered.map(m => {
            const isChecked = customRosterSelectedIds.has(m.id);
            return `
                <label class="custom-member-item">
                    <input type="checkbox" value="${m.id}" ${isChecked ? 'checked' : ''} onchange="toggleCustomMemberSelection('${m.id}', this.checked)">
                    <span class="custom-mem-name">${escapeHtml(m.name)}</span>
                    <span class="custom-mem-meta">${escapeHtml(m.instrument)} &bull; ${getBandLabel(m.assignedBand)}</span>
                </label>
            `;
        }).join('');
    }

    if (countBadge) {
        countBadge.textContent = `${customRosterSelectedIds.size} of ${activeMembers.length} selected`;
    }
}

window.toggleCustomMemberSelection = function(memberId, isChecked) {
    if (isChecked) {
        customRosterSelectedIds.add(memberId);
    } else {
        customRosterSelectedIds.delete(memberId);
    }
    const countBadge = document.getElementById('custom-roster-count');
    const activeMembers = state.members.filter(m => !m.isDeleted);
    if (countBadge) {
        countBadge.textContent = `${customRosterSelectedIds.size} of ${activeMembers.length} selected`;
    }
};

// Coordinator Selection Helper in Event Modal
let eventCoordinatorSelectedIds = new Set();

function renderEventCoordinatorChecklist(selectedIds = null, filterText = '') {
    if (selectedIds !== null) {
        eventCoordinatorSelectedIds = new Set(selectedIds);
    }

    const container = document.getElementById('event-coordinator-items');
    const countBadge = document.getElementById('event-coordinators-count');
    if (!container) return;

    const activeMembers = state.members.filter(m => !m.isDeleted);
    let filtered = activeMembers;
    if (filterText && filterText.trim()) {
        const q = filterText.toLowerCase();
        filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || m.instrument.toLowerCase().includes(q));
    }

    // Sort registered coordinators to the top, then alphabetically
    filtered.sort((a, b) => {
        if (a.isCoordinator && !b.isCoordinator) return -1;
        if (!a.isCoordinator && b.isCoordinator) return 1;
        return a.name.localeCompare(b.name);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p class="view-desc" style="text-align:center; padding: 10px 0;">No members found.</p>`;
    } else {
        container.innerHTML = filtered.map(m => {
            const isChecked = eventCoordinatorSelectedIds.has(m.id);
            return `
                <label class="custom-member-item">
                    <input type="checkbox" value="${m.id}" ${isChecked ? 'checked' : ''} onchange="toggleCoordinatorSelection('${m.id}', this.checked)">
                    <span class="custom-mem-name">${escapeHtml(m.name)} ${m.isCoordinator ? '<span class="badge-coordinator" style="font-size:9.5px; padding:0 4px;"><i data-lucide="shield-check" style="width:9px;height:9px;"></i> Coordinator</span>' : ''}</span>
                    <span class="custom-mem-meta">${escapeHtml(m.instrument)} &bull; ${getBandLabel(m.assignedBand)}</span>
                </label>
            `;
        }).join('');
    }

    if (countBadge) {
        countBadge.textContent = `${eventCoordinatorSelectedIds.size} selected`;
    }
    if (window.lucide) lucide.createIcons();
}

window.toggleCoordinatorSelection = function(memberId, isChecked) {
    if (isChecked) {
        eventCoordinatorSelectedIds.add(memberId);
    } else {
        eventCoordinatorSelectedIds.delete(memberId);
    }
    const countBadge = document.getElementById('event-coordinators-count');
    if (countBadge) {
        countBadge.textContent = `${eventCoordinatorSelectedIds.size} selected`;
    }
};

// Open and populate Event modal for creation
function openNewEventModal() {
    document.getElementById('modal-event-title').textContent = 'Schedule New Event';
    document.getElementById('event-form-id').value = '';
    document.getElementById('event-input-title').value = '';
    
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-input-date').value = today;
    document.getElementById('event-input-time').value = '18:00';
    document.getElementById('event-input-venue').value = '';
    document.getElementById('event-input-band').value = 'full';
    
    document.getElementById('custom-roster-search').value = '';
    renderCustomRosterChecklist([]);
    document.getElementById('custom-roster-group').classList.add('hidden');
    document.getElementById('full-band-maestro-group').classList.remove('hidden');

    document.getElementById('event-coordinator-search').value = '';
    renderEventCoordinatorChecklist([]);

    openModal('modal-event');
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
    document.getElementById('event-input-band').value = evt.ensembleType || 'full';

    const fullMaestroGroup = document.getElementById('full-band-maestro-group');
    const customRosterGroup = document.getElementById('custom-roster-group');
    document.getElementById('custom-roster-search').value = '';

    if (evt.ensembleType === 'custom') {
        if (customRosterGroup) customRosterGroup.classList.remove('hidden');
        if (fullMaestroGroup) {
            fullMaestroGroup.classList.remove('hidden');
            document.getElementById('event-input-maestro').value = evt.maestroId || '';
        }
        renderCustomRosterChecklist(evt.customMemberIds || []);
    } else if (evt.ensembleType === 'full') {
        if (customRosterGroup) customRosterGroup.classList.add('hidden');
        if (fullMaestroGroup) {
            fullMaestroGroup.classList.remove('hidden');
            document.getElementById('event-input-maestro').value = evt.maestroId || '';
        }
    } else {
        if (customRosterGroup) customRosterGroup.classList.add('hidden');
        if (fullMaestroGroup) fullMaestroGroup.classList.add('hidden');
    }

    document.getElementById('event-coordinator-search').value = '';
    renderEventCoordinatorChecklist(evt.coordinatorIds || []);

    openModal('modal-event');
};

function handleEventFormSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('.submit-btn');
    if (submitBtn) submitBtn.classList.add('btn-processing');

    const id = document.getElementById('event-form-id').value;
    const title = document.getElementById('event-input-title').value.trim();
    const date = document.getElementById('event-input-date').value;
    const callTime = document.getElementById('event-input-time').value;
    const venue = document.getElementById('event-input-venue').value.trim();
    const ensembleType = document.getElementById('event-input-band').value;

    let maestroId = '';
    let customMemberIds = [];
    const coordinatorIds = Array.from(eventCoordinatorSelectedIds);

    if (ensembleType === 'band1') {
        maestroId = state.config.band1MaestroId;
    } else if (ensembleType === 'band2') {
        maestroId = state.config.band2MaestroId;
    } else if (ensembleType === 'full' || ensembleType === 'custom') {
        maestroId = document.getElementById('event-input-maestro').value;
    }

    if (ensembleType === 'custom') {
        customMemberIds = Array.from(customRosterSelectedIds);
        if (customMemberIds.length === 0) {
            showToast('Please select at least one musician for the custom ensemble.', 'error');
            if (submitBtn) submitBtn.classList.remove('btn-processing');
            return;
        }
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
            evt.customMemberIds = customMemberIds;
            evt.maestroId = maestroId;
            evt.coordinatorIds = coordinatorIds;
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
            customMemberIds,
            maestroId,
            coordinatorIds,
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

    closeModal('modal-event');
    if (submitBtn) submitBtn.classList.remove('btn-processing');
    renderAll();
}

// Musician Form Handlers (Story 1 CRUD)
function openNewMusicianModal() {
    document.getElementById('modal-musician-title').textContent = 'Add Member / Coordinator';
    document.getElementById('musician-form-id').value = '';
    document.getElementById('musician-input-name').value = '';
    document.getElementById('musician-input-instrument').value = '';
    
    const isCoordTab = state.rosterFilter === 'coordinators';
    document.getElementById('musician-input-band').value = isCoordTab ? 'coordinator' : (state.rosterFilter === 'band2' ? 'band2' : 'band1');
    document.getElementById('musician-input-contact').value = '';
    document.getElementById('musician-input-maestro').checked = false;
    document.getElementById('musician-input-coordinator').checked = isCoordTab;
    openModal('modal-musician');
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
    document.getElementById('musician-input-coordinator').checked = !!mem.isCoordinator;
    openModal('modal-musician');
};

function handleMusicianFormSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('.submit-btn');
    if (submitBtn) submitBtn.classList.add('btn-processing');

    const id = document.getElementById('musician-form-id').value;
    const name = document.getElementById('musician-input-name').value.trim();
    const instrument = document.getElementById('musician-input-instrument').value.trim();
    const assignedBand = document.getElementById('musician-input-band').value;
    const contact = document.getElementById('musician-input-contact').value.trim();
    const isMaestro = document.getElementById('musician-input-maestro').checked;
    const isCoordinator = document.getElementById('musician-input-coordinator').checked;

    if (id) {
        const mem = state.members.find(m => m.id === id);
        if (mem) {
            mem.name = name;
            mem.instrument = instrument;
            mem.assignedBand = assignedBand;
            mem.contact = contact;
            mem.isMaestro = isMaestro;
            mem.isCoordinator = isCoordinator;
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
            isCoordinator,
            isDeleted: false
        };
        state.members.push(newMember);
        saveState();
        apiSaveMember(newMember, true);
        showToast('New musician added to roster!');
    }

    closeModal('modal-musician');
    if (submitBtn) submitBtn.classList.remove('btn-processing');
    renderAll();
}

// Switch directly from History to Attendance tab for a specific event
window.openEventAttendance = function(eventId) {
    state.activeEventId = eventId;
    state.currentTab = 'view-events';
    state.isAttendanceEditing = false; // Always open in clean Read-Only view

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
    const coordinatorObjs = (evt.coordinatorIds || [])
        .map(id => state.members.find(m => m.id === id && !m.isDeleted))
        .filter(Boolean);
    const allParticipants = [
        ...(maestroObj ? [maestroObj] : []),
        ...coordinatorObjs,
        ...roster
    ];

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
    if (coordinatorObjs.length > 0) {
        report += `🛡️ *Coordinator(s):* ${coordinatorObjs.map(c => c.name).join(', ')}\n`;
    }
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
        case 'full': return 'Full Band (Full Roster)';
        case 'custom': return 'Custom Ensemble';
        default: return type;
    }
}

function getBandLabel(band) {
    switch (band) {
        case 'band1': return 'Band 1';
        case 'band2': return 'Band 2';
        case 'both': return 'Band 1 & 2 (Full Band)';
        case 'coordinator': return 'Staff / Coordinator';
        default: return band;
    }
}

let toastTimeout = null;
let toastHideTimeout = null;

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
    if (toastHideTimeout) {
        clearTimeout(toastHideTimeout);
        toastHideTimeout = null;
    }

    const iconHtml = type === 'error' 
        ? '<i data-lucide="alert-circle" style="width:16px;height:16px;color:#f87171;flex-shrink:0;"></i>'
        : '<i data-lucide="check-circle-2" style="width:16px;height:16px;color:#34d399;flex-shrink:0;"></i>';

    toast.innerHTML = `${iconHtml}<span>${escapeHtml(message)}</span>`;
    toast.className = `toast ${type === 'error' ? 'toast-error' : 'toast-success'}`;
    toast.classList.remove('hidden');

    // Trigger reflow for smooth animation
    void toast.offsetWidth;
    toast.classList.add('show');

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }

    // Keep visible for 3.2 seconds so users can comfortably read and process
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        toastHideTimeout = setTimeout(() => {
            if (!toast.classList.contains('show')) {
                toast.classList.add('hidden');
            }
        }, 350);
    }, 3200);
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    void modal.offsetWidth; // Force CSS reflow
    modal.classList.add('active');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
        if (!modal.classList.contains('active')) {
            modal.classList.add('hidden');
        }
    }, 300);
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

