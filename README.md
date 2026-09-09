# BandSync — Band Attendance & Ensemble Management System

A modern, mobile-first full-stack attendance monitoring system designed for bands, orchestras, and musical ensembles.

## ✨ Features

- **Multi-Band & Maestro Management**: Manage musicians across Band 1, Band 2, and Full Band configurations with assigned primary maestros.
- **Event Scheduling**: Schedule rehearsals, concerts, and galas with automatic active roster pulling.
- **Full Attendance Tracking**: Fast roll-call statuses for **Present**, **Absent**, **On Leave**, and **Care Of (C/O)** substitute coverage.
- **Historical Reports & Turnout Analytics**: Filter past events by date range, ensemble type, or maestro with instant turnout KPI calculation.
- **Persistent Backend**: Node.js & Express REST API backend with file-based JSON database persistence (`data/db.json`).
- **Mobile-First UX**: Responsive touch-optimized glassmorphic dark UI with smooth slide-up sheets.

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)

### Installation & Run

1. Clone the repository:
   ```bash
   git clone <YOUR_REPO_URL>
   cd band-attendance
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. **Pull latest Cloud Data to local `data/db.json`:**
   ```bash
   npm run pull-db
   ```

5. Open in browser:
   - **Local PC**: `http://localhost:3000`
   - **Mobile Devices (Same Wi-Fi)**: `http://<your-ip-address>:3000`

## 📁 Project Structure

```text
band-attendance/
├── server.js          # Express REST API backend & static file server
├── package.json       # Dependencies (express, cors)
├── data/
│   └── db.json        # Persistent database
├── index.html         # Frontend HTML structure
├── style.css          # Glassmorphic responsive styling
├── app.js             # Client-side state management & API client
└── README.md
```
