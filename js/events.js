// --- BandSync: Event Scheduling, Custom Ensembles & Modals Module ---

import { state, saveState } from './state.js';
import { apiSaveEvent, apiSaveAttendance } from './api.js';
import { getBandLabel, escapeHtml, showToast, openModal, closeModal } from './utils.js';

export let customRosterSelectedIds = new Set();
export let eventCoordinatorSelectedIds = new Set();

export function renderCustomRosterChecklist(selectedIds = null, filterText = '') {
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

export function toggleCustomMemberSelection(memberId, isChecked) {
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
}

export function renderEventCoordinatorChecklist(selectedIds = null, filterText = '') {
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

export function toggleCoordinatorSelection(memberId, isChecked) {
    if (isChecked) {
        eventCoordinatorSelectedIds.add(memberId);
    } else {
        eventCoordinatorSelectedIds.delete(memberId);
    }
    const countBadge = document.getElementById('event-coordinators-count');
    if (countBadge) {
        countBadge.textContent = `${eventCoordinatorSelectedIds.size} selected`;
    }
}

export function openNewEventModal() {
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

export function openEditEventModal(eventId) {
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
}

export function handleEventFormSubmit(e) {
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
    } else if (ensembleType === 'full' || ensembleType === 'custom' || ensembleType === 'men_of_songs') {
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
    if (window.renderAll) window.renderAll();
}

export function handleCareOfClick(eventId, memberId) {
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

    openModal('modal-careof');
}
