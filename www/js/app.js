// --- BandSync: Main Application Orchestrator & Bootstrapper ---

import { state, loadState, saveState } from './state.js';
import { apiSaveConfig, apiSaveAttendance } from './api.js';
import { formatDate, getEnsembleLabel, getBandLabel, showToast, openModal, closeModal, escapeHtml } from './utils.js';
import { renderEventsCardList, renderActiveEventView, getEventRoster, setAttendanceStatus, openEventAttendance, closeEventDetailView, copySingleEventReport } from './attendance.js';
import { renderRosterView, deleteMusician, openNewMusicianModal, openEditMusicianModal, handleMusicianFormSubmit } from './roster.js';
import { renderCustomRosterChecklist, toggleCustomMemberSelection, renderEventCoordinatorChecklist, toggleCoordinatorSelection, openNewEventModal, openEditEventModal, handleEventFormSubmit, handleCareOfClick } from './events.js';
import { renderHistoryView } from './history.js';

// Bind functions to window for dynamic HTML template string onclick/onchange handlers
window.openEventAttendance = openEventAttendance;
window.closeEventDetailView = closeEventDetailView;
window.copySingleEventReport = copySingleEventReport;
window.setAttendanceStatus = setAttendanceStatus;
window.openNewEventModal = openNewEventModal;
window.openEditEventModal = openEditEventModal;
window.openNewMusicianModal = openNewMusicianModal;
window.openEditMusicianModal = openEditMusicianModal;
window.deleteMusician = deleteMusician;
window.handleCareOfClick = handleCareOfClick;
window.toggleCustomMemberSelection = toggleCustomMemberSelection;
window.toggleCoordinatorSelection = toggleCoordinatorSelection;
window.renderAll = renderAll;

// Master Render Method
export function renderAll() {
    renderNavigation();
    renderEventsCardList();
    if (state.activeEventId) {
        renderActiveEventView();
    }
    renderHistoryView();
    renderRosterView();
    populateSelectDropdowns();
    if (window.lucide) {
        lucide.createIcons();
    }
}

// Navigation View Switcher
export function renderNavigation() {
    document.querySelectorAll('.tab-view').forEach(v => {
        if (v.id === state.currentTab) v.classList.remove('hidden');
        else v.classList.add('hidden');
    });

    if (state.currentTab === 'view-events') {
        const cardView = document.getElementById('attendance-events-card-view');
        const detailView = document.getElementById('attendance-event-detail-view');
        if (state.attendanceViewMode === 'detail' && state.activeEventId) {
            if (cardView) cardView.classList.add('hidden');
            if (detailView) detailView.classList.remove('hidden');
        } else {
            if (cardView) cardView.classList.remove('hidden');
            if (detailView) detailView.classList.add('hidden');
        }
    }
}

// Populate Dropdown Menus
export function populateSelectDropdowns() {
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
    const maestros = state.members.filter(m => !m.isDeleted && (m.isMaestro || m.assignedBand === 'both' || m.assignedBand === 'band1' || m.assignedBand === 'band2' || m.assignedBand === 'men_of_songs'));
    
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

    // Event Modal Designated Maestro dropdown (for Full Band & Custom)
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

// Setup Event Listeners
export function setupEventListeners() {
    // Bottom Tab Navigation Switcher
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = e.currentTarget.getAttribute('data-target');
            if (target === 'view-events' && state.currentTab !== 'view-events') {
                // When switching to Attendance tab from another tab, show the events card list
                state.attendanceViewMode = 'list';
            }
            state.currentTab = target;

            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');

            document.querySelectorAll('.tab-view').forEach(v => v.classList.add('hidden'));
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.classList.remove('hidden');

            renderAll();
        });
    });

    // Back to Events List Button
    const btnBackEvents = document.getElementById('btn-back-to-events-list');
    if (btnBackEvents) {
        btnBackEvents.addEventListener('click', () => closeEventDetailView());
    }

    // Attendance Events List Search
    const eventSearchInput = document.getElementById('attendance-event-list-search');
    if (eventSearchInput) {
        eventSearchInput.addEventListener('input', (e) => {
            state.eventSearch = e.target.value;
            renderEventsCardList();
            if (window.lucide) lucide.createIcons();
        });
    }

    // Active Event Switcher (inside opened event detail view)
    const activeEventSelect = document.getElementById('active-event-select');
    if (activeEventSelect) {
        activeEventSelect.addEventListener('change', (e) => {
            state.activeEventId = e.target.value;
            state.isAttendanceEditing = false; // Always default to read-only when switching events
            renderActiveEventView();
            if (window.lucide) lucide.createIcons();
        });
    }

    // Toggle Edit / Roll-Call Mode Button
    const btnToggleEdit = document.getElementById('btn-toggle-edit-mode');
    if (btnToggleEdit) {
        btnToggleEdit.addEventListener('click', () => {
            state.isAttendanceEditing = !state.isAttendanceEditing;
            renderActiveEventView();
            if (window.lucide) lucide.createIcons();
            if (state.isAttendanceEditing) {
                showToast('Roll Call mode enabled. You can now tap attendance buttons.');
            } else {
                showToast('Switched to Read-Only view.');
            }
        });
    }

    // Quick New Event Button
    const btnQuickNew = document.getElementById('btn-quick-new-event');
    if (btnQuickNew) {
        btnQuickNew.addEventListener('click', () => openNewEventModal());
    }

    // Mark All Present Shortcut
    const btnMarkAll = document.getElementById('btn-mark-all-present');
    if (btnMarkAll) {
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
            if (window.lucide) lucide.createIcons();
            showToast('All roster members marked Present!');
        });
    }

    // Save Attendance / Take Roll Call Action Button
    const btnSaveAtt = document.getElementById('btn-save-attendance');
    if (btnSaveAtt) {
        btnSaveAtt.addEventListener('click', () => {
            const activeEvent = state.events.find(e => e.id === state.activeEventId);
            if (!activeEvent) return;

            if (!state.isAttendanceEditing) {
                // If in Read-Only view, clicking button enters editing mode
                state.isAttendanceEditing = true;
                renderActiveEventView();
                if (window.lucide) lucide.createIcons();
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
    }

    // Share / Copy Report Button
    const btnCopyReport = document.getElementById('btn-copy-report');
    if (btnCopyReport) {
        btnCopyReport.addEventListener('click', () => {
            copySingleEventReport(state.activeEventId);
        });
    }

    // Attendance Live Search & Sort
    const rosterSearchInput = document.getElementById('roster-search');
    if (rosterSearchInput) {
        rosterSearchInput.addEventListener('input', (e) => {
            state.attendanceSearch = e.target.value;
            renderActiveEventView();
            if (window.lucide) lucide.createIcons();
        });
    }

    const attendanceSortSelect = document.getElementById('attendance-sort-order');
    if (attendanceSortSelect) {
        attendanceSortSelect.addEventListener('change', (e) => {
            state.attendanceSort = e.target.value;
            renderActiveEventView();
            if (window.lucide) lucide.createIcons();
        });
    }

    // Primary Maestro change handlers
    const b1MaestroSelect = document.getElementById('select-band1-maestro');
    if (b1MaestroSelect) {
        b1MaestroSelect.addEventListener('change', (e) => {
            state.config.band1MaestroId = e.target.value;
            saveState();
            apiSaveConfig(state.config);
            showToast('Band 1 Primary Maestro updated.');
        });
    }

    const b2MaestroSelect = document.getElementById('select-band2-maestro');
    if (b2MaestroSelect) {
        b2MaestroSelect.addEventListener('change', (e) => {
            state.config.band2MaestroId = e.target.value;
            saveState();
            apiSaveConfig(state.config);
            showToast('Band 2 Primary Maestro updated.');
        });
    }

    // Roster Band Pill filters
    document.querySelectorAll('.pill-btn').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.pill-btn').forEach(p => p.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.rosterFilter = e.currentTarget.getAttribute('data-roster-filter');
            renderRosterView();
            if (window.lucide) lucide.createIcons();
        });
    });

    // Roster Search & Sort Input
    const manageRosterSearch = document.getElementById('manage-roster-search');
    if (manageRosterSearch) {
        manageRosterSearch.addEventListener('input', (e) => {
            state.rosterSearch = e.target.value;
            renderRosterView();
            if (window.lucide) lucide.createIcons();
        });
    }

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
            if (window.lucide) lucide.createIcons();
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
            if (window.lucide) lucide.createIcons();
        });
    }

    const filterMaestro = document.getElementById('filter-maestro');
    if (filterMaestro) {
        filterMaestro.addEventListener('change', (e) => {
            state.historyFilters.maestro = e.target.value;
            renderHistoryView();
            if (window.lucide) lucide.createIcons();
        });
    }

    const filterDateRange = document.getElementById('filter-date-range');
    if (filterDateRange) {
        filterDateRange.addEventListener('change', (e) => {
            state.historyFilters.dateRange = e.target.value;
            renderHistoryView();
            if (window.lucide) lucide.createIcons();
        });
    }

    // Modal Close & Cancel Buttons with Smooth Animation
    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modalId = e.currentTarget.getAttribute('data-close');
            if (modalId) closeModal(modalId);
        });
    });

    // Make Modals Sticky: Clicking backdrop does NOT close the modal, giving subtle feedback
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                const sheet = overlay.querySelector('.modal-sheet');
                if (sheet) {
                    sheet.classList.remove('modal-sheet-shake');
                    void sheet.offsetWidth; // Force CSS reflow
                    sheet.classList.add('modal-sheet-shake');
                }
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
            } else if (val === 'full' || val === 'men_of_songs') {
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

    const btnSelectMos = document.getElementById('btn-select-mos');
    if (btnSelectMos) {
        btnSelectMos.addEventListener('click', () => {
            const mosIds = state.members.filter(m => !m.isDeleted && m.assignedBand === 'men_of_songs').map(m => m.id);
            renderCustomRosterChecklist(mosIds);
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
                if (window.lucide) lucide.createIcons();
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
                if (window.lucide) lucide.createIcons();
                closeModal('modal-careof');
                showToast('Care Of status removed.');
            }
        });
    }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
    await loadState();
    setupEventListeners();
    renderAll();
    if (window.lucide) {
        lucide.createIcons();
    }
});
