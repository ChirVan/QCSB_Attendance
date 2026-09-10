// --- BandSync: Global State & Local Persistence ---

export const DEFAULT_MEMBERS = [];

export const DEFAULT_CONFIG = {
    band1MaestroId: '',
    band2MaestroId: ''
};

export const DEFAULT_EVENTS = [];

export const state = {
    members: [],
    config: {},
    events: [],
    activeEventId: '',
    attendanceViewMode: 'list', // 'list' (events cards) | 'detail' (opened event roll call)
    eventSearch: '',
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

export const IS_SERVER = window.location.protocol.startsWith('http');

export async function loadState() {
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

export function saveState() {
    localStorage.setItem('bandsync_v2_members', JSON.stringify(state.members));
    localStorage.setItem('bandsync_v2_config', JSON.stringify(state.config));
    localStorage.setItem('bandsync_v2_events', JSON.stringify(state.events));
}
