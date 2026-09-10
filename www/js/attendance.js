// --- BandSync: Attendance Management & Roll Call Module ---

import { state, saveState } from './state.js';
import { apiSaveAttendance } from './api.js';
import { formatDate, getEnsembleLabel, getBandLabel, escapeHtml, copyToClipboard, showToast } from './utils.js';

export function renderEventsCardList() {
    const container = document.getElementById('attendance-events-cards-list');
    if (!container) return;

    let filteredEvents = [...state.events];

    if (state.eventSearch && state.eventSearch.trim()) {
        const q = state.eventSearch.toLowerCase();
        filteredEvents = filteredEvents.filter(e => 
            e.title.toLowerCase().includes(q) ||
            e.venue.toLowerCase().includes(q) ||
            getEnsembleLabel(e.ensembleType).toLowerCase().includes(q)
        );
    }

    // Sort by date (newest / upcoming first)
    filteredEvents.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredEvents.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 16px; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 12px;">
                <i data-lucide="calendar-x" style="width: 32px; height: 32px; color: var(--color-text-sub); margin-bottom: 8px;"></i>
                <p style="font-size: 13px; font-weight: 600; color: #ffffff; margin-bottom: 4px;">No events found</p>
                <p class="view-desc" style="margin-bottom: 12px;">Schedule an event to start recording roll call.</p>
                <button class="primary-icon-btn" style="margin: 0 auto;" onclick="openNewEventModal()">
                    <i data-lucide="plus"></i>
                    <span>Schedule New Event</span>
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredEvents.map(evt => {
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
        const isCompleted = evt.status === 'completed';

        return `
            <div class="event-entry-card" onclick="openEventAttendance('${evt.id}')">
                <div class="event-entry-top">
                    <div>
                        <h3 class="event-entry-title">${escapeHtml(evt.title)}</h3>
                        <span class="ensemble-badge badge-${evt.ensembleType}">${getEnsembleLabel(evt.ensembleType)}</span>
                    </div>
                    ${isCompleted 
                        ? '<span class="read-status-badge present" style="font-size:10px;"><i data-lucide="check-check"></i> Recorded</span>' 
                        : '<span class="read-status-badge leave" style="font-size:10px;"><i data-lucide="clock"></i> Active</span>'}
                </div>

                <div class="event-entry-meta">
                    <div class="meta-item"><i data-lucide="calendar"></i> <span>${formatDate(evt.date)}</span></div>
                    <div class="meta-item"><i data-lucide="clock"></i> <span>Call: ${evt.callTime}</span></div>
                    <div class="meta-item"><i data-lucide="map-pin"></i> <span>${escapeHtml(evt.venue)}</span></div>
                    <div class="meta-item"><i data-lucide="crown"></i> <span>Maestro: ${maestroObj ? escapeHtml(maestroObj.name) : 'None'}</span></div>
                </div>

                <div class="history-stats-pill-row" style="margin-top: 2px;">
                    <span class="history-pill turnout">Turnout: ${turnout}%</span>
                    <span class="history-pill present">✅ ${pCount} Present</span>
                    <span class="history-pill absent">❌ ${aCount} Absent</span>
                    ${cCount > 0 ? `<span class="history-pill careof">🔄 ${cCount} C/O</span>` : ''}
                    ${lCount > 0 ? `<span class="history-pill leave">⏳ ${lCount} Leave</span>` : ''}
                </div>

                <div class="event-entry-footer">
                    <span class="view-desc"><i data-lucide="users" style="width:12px;height:12px;display:inline;vertical-align:middle;"></i> ${allParticipants.length} Musician${allParticipants.length === 1 ? '' : 's'}</span>
                    <button class="event-open-btn" onclick="event.stopPropagation(); openEventAttendance('${evt.id}')">
                        <i data-lucide="clipboard-check" style="width:13px;height:13px;"></i>
                        <span>Open Attendance</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function renderActiveEventView() {
    const activeEvent = state.events.find(e => e.id === state.activeEventId);
    const heroCard = document.getElementById('active-event-card');
    const maestroCard = document.getElementById('event-maestro-card');
    const rosterList = document.getElementById('attendance-roster-list');
    const countBadge = document.getElementById('roster-count-badge');

    if (!activeEvent) {
        if (heroCard) heroCard.innerHTML = `<p class="view-desc" style="text-align: center; padding: 20px 0;">No active event selected. Click "+ New Event" to create one.</p>`;
        if (maestroCard) maestroCard.innerHTML = '';
        if (rosterList) rosterList.innerHTML = '';
        updateStatsCounters(0, 0, 0, 0, 0);
        return;
    }

    // Render Event Hero Details
    const maestroObj = state.members.find(m => m.id === activeEvent.maestroId);
    if (heroCard) {
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
    }

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
    if (countBadge) countBadge.textContent = assignedMembers.length;

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
    if (maestroCard) {
        if (maestroObj) {
            const maestroStatus = activeEvent.attendance ? activeEvent.attendance[maestroObj.id] || '' : '';
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
                const cStatus = activeEvent.attendance ? activeEvent.attendance[c.id] || '' : '';
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
        const q = (state.attendanceSearch || '').toLowerCase();
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
    if (rosterList) {
        if (filteredRoster.length === 0) {
            rosterList.innerHTML = `<p class="view-desc" style="text-align:center; padding: 20px 0;">No musicians found matching query.</p>`;
        } else {
            rosterList.innerHTML = filteredRoster.map(m => {
                const status = activeEvent.attendance ? activeEvent.attendance[m.id] || '' : '';
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
        const s = activeEvent.attendance ? activeEvent.attendance[p.id] : null;
        if (s === 'present') presentCount++;
        else if (s === 'absent') absentCount++;
        else if (s === 'leave') leaveCount++;
        else if (s === 'careof') careOfCount++;
    });

    const turnoutRate = allParticipants.length > 0 ? Math.round(((presentCount + careOfCount) / allParticipants.length) * 100) : 0;

    updateStatsCounters(presentCount, absentCount, leaveCount, careOfCount, turnoutRate);
}

export function updateStatsCounters(present, absent, leave, careof, turnout) {
    const elPresent = document.getElementById('stat-present');
    const elAbsent = document.getElementById('stat-absent');
    const elLeave = document.getElementById('stat-leave');
    const elCareof = document.getElementById('stat-careof');
    const elTurnout = document.getElementById('stat-turnout');

    if (elPresent) elPresent.textContent = present;
    if (elAbsent) elAbsent.textContent = absent;
    if (elLeave) elLeave.textContent = leave;
    if (elCareof) elCareof.textContent = careof;
    if (elTurnout) elTurnout.textContent = `${turnout}%`;
}

export function getEventRoster(event) {
    if (!event) return [];
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
        } else if (event.ensembleType === 'men_of_songs') {
            return m.assignedBand === 'men_of_songs';
        } else if (event.ensembleType === 'custom') {
            return Array.isArray(event.customMemberIds) && event.customMemberIds.includes(m.id);
        } else if (event.ensembleType === 'full') {
            return true;
        }
        return true;
    });
}

export function setAttendanceStatus(eventId, memberId, newStatus) {
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
    if (window.lucide) lucide.createIcons();
}

export function openEventAttendance(eventId) {
    state.activeEventId = eventId;
    state.attendanceViewMode = 'detail';
    state.currentTab = 'view-events';
    state.isAttendanceEditing = false; // Always open in safe Read-Only view

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const attNav = document.querySelector('.nav-item[data-target="view-events"]');
    if (attNav) attNav.classList.add('active');

    if (window.renderAll) window.renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function closeEventDetailView() {
    state.attendanceViewMode = 'list';
    if (window.renderAll) window.renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function copySingleEventReport(eventId) {
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
}
