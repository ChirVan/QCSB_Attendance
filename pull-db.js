require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'db.json');

const MemberSchema = new mongoose.Schema({
    id: String,
    name: String,
    instrument: String,
    assignedBand: String,
    contact: String,
    isMaestro: Boolean,
    isDeleted: Boolean
}, { timestamps: true });

const ConfigSchema = new mongoose.Schema({
    key: String,
    band1MaestroId: String,
    band2MaestroId: String
}, { timestamps: true });

const EventSchema = new mongoose.Schema({
    id: String,
    title: String,
    date: String,
    callTime: String,
    venue: String,
    ensembleType: String,
    maestroId: String,
    attendance: Object,
    careOfDetails: Object,
    status: String
}, { timestamps: true, minimize: false });

const MemberModel = mongoose.model('Member', MemberSchema);
const ConfigModel = mongoose.model('Config', ConfigSchema);
const EventModel = mongoose.model('Event', EventSchema);

async function pullDatabase() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('❌ MONGODB_URI is not defined in your .env file!');
        process.exit(1);
    }

    console.log('🔄 Connecting to MongoDB Atlas Cloud Database...');
    try {
        await mongoose.connect(uri);
        console.log('✅ Connected! Pulling data from cloud...');

        const [members, configDoc, events] = await Promise.all([
            MemberModel.find().lean(),
            ConfigModel.findOne({ key: 'global' }).lean(),
            EventModel.find().sort({ date: -1 }).lean()
        ]);

        // Clean internal MongoDB fields (_id, __v) for clean JSON format
        const cleanMembers = members.map(({ _id, __v, ...rest }) => rest);
        const cleanEvents = events.map(({ _id, __v, ...rest }) => rest);
        const cleanConfig = configDoc ? {
            band1MaestroId: configDoc.band1MaestroId || '',
            band2MaestroId: configDoc.band2MaestroId || ''
        } : {
            band1MaestroId: '',
            band2MaestroId: ''
        };

        const dbData = {
            members: cleanMembers,
            config: cleanConfig,
            events: cleanEvents
        };

        if (!fs.existsSync(DB_DIR)) {
            fs.mkdirSync(DB_DIR, { recursive: true });
        }

        fs.writeFileSync(DB_PATH, JSON.stringify(dbData, null, 2), 'utf8');

        console.log('========================================================');
        console.log(`🎉 SUCCESS! Production data pulled to: data/db.json`);
        console.log(`   - Members: ${cleanMembers.length}`);
        console.log(`   - Events:  ${cleanEvents.length}`);
        console.log('========================================================');

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error pulling data from MongoDB Atlas:', err.message);
        process.exit(1);
    }
}

pullDatabase();
