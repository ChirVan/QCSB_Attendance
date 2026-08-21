const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Initial Seed Data (Empty)
const SEED_DATA = {
    members: [],
    config: {
        band1MaestroId: '',
        band2MaestroId: ''
    },
    events: []
};

// Database Helpers
function readDatabase() {
    try {
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }
        if (!fs.existsSync(DB_PATH)) {
            fs.writeFileSync(DB_PATH, JSON.stringify(SEED_DATA, null, 2), 'utf8');
            return SEED_DATA;
        }
        const data = fs.readFileSync(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading database:', err);
        return SEED_DATA;
    }
}

function writeDatabase(data) {
    try {
        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.error('Error writing to database:', err);
        return false;
    }
}

// ----------------------------------------------------
// REST API ENDPOINTS
// ----------------------------------------------------

// GET Full State
app.get('/api/state', (req, res) => {
    const db = readDatabase();
    res.json(db);
});

// MEMBERS CRUD
app.get('/api/members', (req, res) => {
    const db = readDatabase();
    res.json(db.members || []);
});

app.post('/api/members', (req, res) => {
    const { name, instrument, assignedBand, contact, isMaestro } = req.body;
    if (!name || !instrument) {
        return res.status(400).json({ error: 'Name and instrument are required.' });
    }

    const db = readDatabase();
    const newMember = {
        id: 'mem_' + Date.now(),
        name: name.trim(),
        instrument: instrument.trim(),
        assignedBand: assignedBand || 'band1',
        contact: contact ? contact.trim() : '',
        isMaestro: !!isMaestro,
        isDeleted: false
    };

    db.members.push(newMember);
    writeDatabase(db);
    res.status(201).json(newMember);
});

app.put('/api/members/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const db = readDatabase();

    const member = db.members.find(m => m.id === id);
    if (!member) {
        return res.status(404).json({ error: 'Member not found.' });
    }

    if (updates.name !== undefined) member.name = updates.name.trim();
    if (updates.instrument !== undefined) member.instrument = updates.instrument.trim();
    if (updates.assignedBand !== undefined) member.assignedBand = updates.assignedBand;
    if (updates.contact !== undefined) member.contact = updates.contact.trim();
    if (updates.isMaestro !== undefined) member.isMaestro = !!updates.isMaestro;
    if (updates.isDeleted !== undefined) member.isDeleted = !!updates.isDeleted;

    writeDatabase(db);
    res.json(member);
});

app.delete('/api/members/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();

    const member = db.members.find(m => m.id === id);
    if (!member) {
        return res.status(404).json({ error: 'Member not found.' });
    }

    // Soft delete to maintain historical attendance integrity
    member.isDeleted = true;
    writeDatabase(db);
    res.json({ message: 'Member archived successfully.', member });
});

// CONFIG (Primary Maestros)
app.get('/api/config', (req, res) => {
    const db = readDatabase();
    res.json(db.config || {});
});

app.put('/api/config', (req, res) => {
    const db = readDatabase();
    const { band1MaestroId, band2MaestroId } = req.body;

    if (band1MaestroId) db.config.band1MaestroId = band1MaestroId;
    if (band2MaestroId) db.config.band2MaestroId = band2MaestroId;

    writeDatabase(db);
    res.json(db.config);
});

// EVENTS & ATTENDANCE
app.get('/api/events', (req, res) => {
    const db = readDatabase();
    res.json(db.events || []);
});

app.post('/api/events', (req, res) => {
    const { title, date, callTime, venue, ensembleType, maestroId } = req.body;
    if (!title || !date || !venue) {
        return res.status(400).json({ error: 'Title, date, and venue are required.' });
    }

    const db = readDatabase();
    const newEvent = {
        id: 'evt_' + Date.now(),
        title: title.trim(),
        date,
        callTime: callTime || '18:00',
        venue: venue.trim(),
        ensembleType: ensembleType || 'band1',
        maestroId: maestroId || (ensembleType === 'band2' ? db.config.band2MaestroId : db.config.band1MaestroId),
        attendance: {},
        careOfDetails: {},
        status: 'scheduled'
    };

    db.events.unshift(newEvent);
    writeDatabase(db);
    res.status(201).json(newEvent);
});

app.put('/api/events/:id', (req, res) => {
    const { id } = req.params;
    const updates = req.body;
    const db = readDatabase();

    const evt = db.events.find(e => e.id === id);
    if (!evt) {
        return res.status(404).json({ error: 'Event not found.' });
    }

    if (updates.title !== undefined) evt.title = updates.title.trim();
    if (updates.date !== undefined) evt.date = updates.date;
    if (updates.callTime !== undefined) evt.callTime = updates.callTime;
    if (updates.venue !== undefined) evt.venue = updates.venue.trim();
    if (updates.ensembleType !== undefined) evt.ensembleType = updates.ensembleType;
    if (updates.maestroId !== undefined) evt.maestroId = updates.maestroId;
    if (updates.status !== undefined) evt.status = updates.status;

    writeDatabase(db);
    res.json(evt);
});

// Record / Update Attendance & Care Of for an Event
app.put('/api/events/:id/attendance', (req, res) => {
    const { id } = req.params;
    const { attendance, careOfDetails, status } = req.body;
    const db = readDatabase();

    const evt = db.events.find(e => e.id === id);
    if (!evt) {
        return res.status(404).json({ error: 'Event not found.' });
    }

    if (attendance !== undefined) evt.attendance = attendance;
    if (careOfDetails !== undefined) evt.careOfDetails = careOfDetails;
    if (status !== undefined) evt.status = status;

    writeDatabase(db);
    res.json(evt);
});

app.delete('/api/events/:id', (req, res) => {
    const { id } = req.params;
    const db = readDatabase();

    const index = db.events.findIndex(e => e.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Event not found.' });
    }

    const deleted = db.events.splice(index, 1)[0];
    writeDatabase(db);
    res.json({ message: 'Event deleted.', event: deleted });
});

// Fallback to index.html for single page app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🎵 BandSync Server is running on port ${PORT}`);
    console.log(`💻 Local access:   http://localhost:${PORT}`);
    console.log(`📱 Mobile access:  http://<your-ip-address>:${PORT}`);
    console.log(`====================================================`);
});
