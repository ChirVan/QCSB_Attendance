require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ----------------------------------------------------
// MONGODB CLOUD DATABASE INTEGRATION
// ----------------------------------------------------
let isMongoConnected = false;
const MONGODB_URI = process.env.MONGODB_URI;

// Mongoose Schemas
const MemberSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    instrument: { type: String, required: true },
    assignedBand: { type: String, default: 'band1' },
    contact: { type: String, default: '' },
    isMaestro: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false }
}, { timestamps: true });

const ConfigSchema = new mongoose.Schema({
    key: { type: String, default: 'global', unique: true },
    band1MaestroId: { type: String, default: '' },
    band2MaestroId: { type: String, default: '' }
}, { timestamps: true });

const EventSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    date: { type: String, required: true },
    callTime: { type: String, default: '18:00' },
    venue: { type: String, required: true },
    ensembleType: { type: String, default: 'full' },
    customMemberIds: { type: [String], default: [] },
    maestroId: { type: String, default: '' },
    attendance: { type: Object, default: {} },
    careOfDetails: { type: Object, default: {} },
    status: { type: String, default: 'scheduled' }
}, { timestamps: true, minimize: false });

const MemberModel = mongoose.model('Member', MemberSchema);
const ConfigModel = mongoose.model('Config', ConfigSchema);
const EventModel = mongoose.model('Event', EventSchema);

if (MONGODB_URI) {
    mongoose.connect(MONGODB_URI)
        .then(() => {
            isMongoConnected = true;
            console.log('✅ Connected to MongoDB Atlas Cloud Database!');
        })
        .catch(err => {
            console.error('❌ MongoDB Connection Error. Falling back to local db.json:', err.message);
            isMongoConnected = false;
        });
} else {
    console.log('ℹ️ No MONGODB_URI provided. Running in local JSON storage mode (data/db.json).');
}

// ----------------------------------------------------
// LOCAL JSON DATABASE FALLBACK HELPERS
// ----------------------------------------------------
const SEED_DATA = {
    members: [],
    config: {
        band1MaestroId: '',
        band2MaestroId: ''
    },
    events: []
};

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

// 1. GET Full Application State
app.get('/api/state', async (req, res) => {
    if (isMongoConnected) {
        try {
            const [members, configDoc, events] = await Promise.all([
                MemberModel.find().lean(),
                ConfigModel.findOne({ key: 'global' }).lean(),
                EventModel.find().sort({ date: -1 }).lean()
            ]);

            const config = configDoc ? {
                band1MaestroId: configDoc.band1MaestroId || '',
                band2MaestroId: configDoc.band2MaestroId || ''
            } : { band1MaestroId: '', band2MaestroId: '' };

            return res.json({ members, config, events });
        } catch (err) {
            console.error('MongoDB state fetch error:', err);
        }
    }

    const db = readDatabase();
    res.json(db);
});

// 2. MEMBERS CRUD
app.get('/api/members', async (req, res) => {
    if (isMongoConnected) {
        try {
            const members = await MemberModel.find().lean();
            return res.json(members);
        } catch (err) {
            console.error('MongoDB get members error:', err);
        }
    }
    const db = readDatabase();
    res.json(db.members || []);
});

app.post('/api/members', async (req, res) => {
    const { name, instrument, assignedBand, contact, isMaestro } = req.body;
    if (!name || !instrument) {
        return res.status(400).json({ error: 'Name and instrument are required.' });
    }

    const newMember = {
        id: 'mem_' + Date.now(),
        name: name.trim(),
        instrument: instrument.trim(),
        assignedBand: assignedBand || 'band1',
        contact: contact ? contact.trim() : '',
        isMaestro: !!isMaestro,
        isDeleted: false
    };

    if (isMongoConnected) {
        try {
            const created = await MemberModel.create(newMember);
            return res.status(201).json(created);
        } catch (err) {
            console.error('MongoDB create member error:', err);
        }
    }

    const db = readDatabase();
    db.members.push(newMember);
    writeDatabase(db);
    res.status(201).json(newMember);
});

app.put('/api/members/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    if (isMongoConnected) {
        try {
            const updated = await MemberModel.findOneAndUpdate({ id }, { $set: updates }, { new: true });
            if (updated) return res.json(updated);
        } catch (err) {
            console.error('MongoDB update member error:', err);
        }
    }

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

app.delete('/api/members/:id', async (req, res) => {
    const { id } = req.params;

    if (isMongoConnected) {
        try {
            const archived = await MemberModel.findOneAndUpdate({ id }, { $set: { isDeleted: true } }, { new: true });
            if (archived) return res.json({ message: 'Member archived successfully.', member: archived });
        } catch (err) {
            console.error('MongoDB delete member error:', err);
        }
    }

    const db = readDatabase();
    const member = db.members.find(m => m.id === id);
    if (!member) {
        return res.status(404).json({ error: 'Member not found.' });
    }

    member.isDeleted = true;
    writeDatabase(db);
    res.json({ message: 'Member archived successfully.', member });
});

// 3. CONFIG (Primary Maestros)
app.get('/api/config', async (req, res) => {
    if (isMongoConnected) {
        try {
            const configDoc = await ConfigModel.findOne({ key: 'global' }).lean();
            if (configDoc) {
                return res.json({
                    band1MaestroId: configDoc.band1MaestroId || '',
                    band2MaestroId: configDoc.band2MaestroId || ''
                });
            }
        } catch (err) {
            console.error('MongoDB get config error:', err);
        }
    }

    const db = readDatabase();
    res.json(db.config || {});
});

app.put('/api/config', async (req, res) => {
    const { band1MaestroId, band2MaestroId } = req.body;

    if (isMongoConnected) {
        try {
            const updated = await ConfigModel.findOneAndUpdate(
                { key: 'global' },
                { $set: { band1MaestroId, band2MaestroId } },
                { upsert: true, new: true }
            );
            return res.json(updated);
        } catch (err) {
            console.error('MongoDB update config error:', err);
        }
    }

    const db = readDatabase();
    if (band1MaestroId !== undefined) db.config.band1MaestroId = band1MaestroId;
    if (band2MaestroId !== undefined) db.config.band2MaestroId = band2MaestroId;

    writeDatabase(db);
    res.json(db.config);
});

// 4. EVENTS & ATTENDANCE
app.get('/api/events', async (req, res) => {
    if (isMongoConnected) {
        try {
            const events = await EventModel.find().sort({ date: -1 }).lean();
            return res.json(events);
        } catch (err) {
            console.error('MongoDB get events error:', err);
        }
    }

    const db = readDatabase();
    res.json(db.events || []);
});

app.post('/api/events', async (req, res) => {
    const { title, date, callTime, venue, ensembleType, customMemberIds, maestroId } = req.body;
    if (!title || !date || !venue) {
        return res.status(400).json({ error: 'Title, date, and venue are required.' });
    }

    const newEvent = {
        id: 'evt_' + Date.now(),
        title: title.trim(),
        date,
        callTime: callTime || '18:00',
        venue: venue.trim(),
        ensembleType: ensembleType || 'full',
        customMemberIds: Array.isArray(customMemberIds) ? customMemberIds : [],
        maestroId: maestroId || '',
        attendance: {},
        careOfDetails: {},
        status: 'scheduled'
    };

    if (isMongoConnected) {
        try {
            const created = await EventModel.create(newEvent);
            return res.status(201).json(created);
        } catch (err) {
            console.error('MongoDB create event error:', err);
        }
    }

    const db = readDatabase();
    db.events.unshift(newEvent);
    writeDatabase(db);
    res.status(201).json(newEvent);
});

app.put('/api/events/:id', async (req, res) => {
    const { id } = req.params;
    const updates = req.body;

    if (isMongoConnected) {
        try {
            const updated = await EventModel.findOneAndUpdate({ id }, { $set: updates }, { new: true });
            if (updated) return res.json(updated);
        } catch (err) {
            console.error('MongoDB update event error:', err);
        }
    }

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
    if (updates.customMemberIds !== undefined) evt.customMemberIds = Array.isArray(updates.customMemberIds) ? updates.customMemberIds : [];
    if (updates.maestroId !== undefined) evt.maestroId = updates.maestroId;
    if (updates.status !== undefined) evt.status = updates.status;

    writeDatabase(db);
    res.json(evt);
});

app.put('/api/events/:id/attendance', async (req, res) => {
    const { id } = req.params;
    const { attendance, careOfDetails, status } = req.body;

    if (isMongoConnected) {
        try {
            const updated = await EventModel.findOneAndUpdate(
                { id },
                { $set: { attendance, careOfDetails, status } },
                { new: true }
            );
            if (updated) return res.json(updated);
        } catch (err) {
            console.error('MongoDB update attendance error:', err);
        }
    }

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

app.delete('/api/events/:id', async (req, res) => {
    const { id } = req.params;

    if (isMongoConnected) {
        try {
            const deleted = await EventModel.findOneAndDelete({ id });
            if (deleted) return res.json({ message: 'Event deleted.', event: deleted });
        } catch (err) {
            console.error('MongoDB delete event error:', err);
        }
    }

    const db = readDatabase();
    const index = db.events.findIndex(e => e.id === id);
    if (index === -1) {
        return res.status(404).json({ error: 'Event not found.' });
    }

    const deleted = db.events.splice(index, 1)[0];
    writeDatabase(db);
    res.json({ message: 'Event deleted.', event: deleted });
});

// Single-page app fallback
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🎵 BandSync Server is running on port ${PORT}`);
    console.log(`💾 Database: ${MONGODB_URI ? 'MongoDB Atlas (Cloud)' : 'Local JSON file (data/db.json)'}`);
    console.log(`💻 Local:    http://localhost:${PORT}`);
    console.log(`====================================================`);
});
