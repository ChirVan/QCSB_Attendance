// --- BandSync: REST API Communication Client ---

import { IS_SERVER } from './state.js';

export async function apiSaveAttendance(event) {
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

export async function apiSaveEvent(event, isNew = false) {
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

export async function apiSaveMember(member, isNew = false) {
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

export async function apiDeleteMember(memberId) {
    if (!IS_SERVER) return;
    try {
        await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
    } catch (err) {
        console.error('Failed to delete member on backend:', err);
    }
}

export async function apiSaveConfig(config) {
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
