// --- BandSync: Historical Events & Reports Module ---

import { state } from './state.js';
import { getEventRoster } from './attendance.js';
import { formatDate, getEnsembleLabel, escapeHtml } from './utils.js';

export function renderHistoryView() {
    const listContainer = document.getElementById('history-events-list');
    if (!listContainer) return;
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
