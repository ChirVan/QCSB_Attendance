// --- BandSync: Musician Roster & Band Management Module ---

import { state, saveState } from './state.js';
import { apiSaveMember, apiDeleteMember } from './api.js';
import { getBandLabel, escapeHtml, showToast, openModal, closeModal } from './utils.js';

export function renderRosterView() {
    const listContainer = document.getElementById('manage-musicians-list');
    if (!listContainer) return;
    const activeMembers = state.members.filter(m => !m.isDeleted);

    // Compute live category counts
    const fullBandCount = activeMembers.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator').length;
    const band1Count = activeMembers.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band1' || m.assignedBand === 'both')).length;
    const band2Count = activeMembers.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band2' || m.assignedBand === 'both')).length;
    const mosCount = activeMembers.filter(m => !m.isCoordinator && m.assignedBand === 'men_of_songs').length;
    const coordCount = activeMembers.filter(m => m.isCoordinator || m.assignedBand === 'coordinator').length;

    // Update pill tab button labels with counts
    const pillAll = document.querySelector('.pill-btn[data-roster-filter="all"]');
    const pillB1 = document.querySelector('.pill-btn[data-roster-filter="band1"]');
    const pillB2 = document.querySelector('.pill-btn[data-roster-filter="band2"]');
    const pillMos = document.querySelector('.pill-btn[data-roster-filter="men_of_songs"]');
    const pillCoord = document.querySelector('.pill-btn[data-roster-filter="coordinators"]');

    if (pillAll) pillAll.innerHTML = `Full Band <span style="opacity:0.8; font-size:10px;">(${fullBandCount})</span>`;
    if (pillB1) pillB1.innerHTML = `Band 1 <span style="opacity:0.8; font-size:10px;">(${band1Count})</span>`;
    if (pillB2) pillB2.innerHTML = `Band 2 <span style="opacity:0.8; font-size:10px;">(${band2Count})</span>`;
    if (pillMos) pillMos.innerHTML = `Men of Songs <span style="opacity:0.8; font-size:10px;">(${mosCount})</span>`;
    if (pillCoord) pillCoord.innerHTML = `<i data-lucide="shield-check" style="width:12px;height:12px;display:inline;vertical-align:middle;"></i> Coordinators <span style="opacity:0.8; font-size:10px;">(${coordCount})</span>`;

    let filtered = [...activeMembers];

    // Filter by Tab: Coordinators & Men of Songs have their own dedicated tabs
    if (state.rosterFilter === 'coordinators') {
        filtered = filtered.filter(m => m.isCoordinator || m.assignedBand === 'coordinator');
    } else if (state.rosterFilter === 'band1') {
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band1' || m.assignedBand === 'both'));
    } else if (state.rosterFilter === 'band2') {
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator' && (m.assignedBand === 'band2' || m.assignedBand === 'both'));
    } else if (state.rosterFilter === 'men_of_songs') {
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand === 'men_of_songs');
    } else {
        // 'all' / Full Band: Only playing musicians in Full Band, excluding Coordinators
        filtered = filtered.filter(m => !m.isCoordinator && m.assignedBand !== 'coordinator');
    }

    // Filter by Search Query
    if (state.rosterSearch && state.rosterSearch.trim() !== '') {
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

export function deleteMusician(memberId) {
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
        if (window.renderAll) window.renderAll();
        showToast('Musician archived successfully.');
    }
}

export function openNewMusicianModal() {
    document.getElementById('modal-musician-title').textContent = 'Add Member / Coordinator';
    document.getElementById('musician-form-id').value = '';
    document.getElementById('musician-input-name').value = '';
    document.getElementById('musician-input-instrument').value = '';
    
    const isCoordTab = state.rosterFilter === 'coordinators';
    let defaultBand = 'band1';
    if (isCoordTab) defaultBand = 'coordinator';
    else if (state.rosterFilter === 'band2') defaultBand = 'band2';
    else if (state.rosterFilter === 'men_of_songs') defaultBand = 'men_of_songs';
    document.getElementById('musician-input-band').value = defaultBand;
    document.getElementById('musician-input-contact').value = '';
    document.getElementById('musician-input-maestro').checked = false;
    document.getElementById('musician-input-coordinator').checked = isCoordTab;
    openModal('modal-musician');
}

export function openEditMusicianModal(memberId) {
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
}

export function handleMusicianFormSubmit(e) {
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
    if (window.renderAll) window.renderAll();
}
