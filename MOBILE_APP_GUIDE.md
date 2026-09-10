# 📱 BandSync Mobile Installation & APK Guide

BandSync is fully configured for mobile use through two convenient methods:

---

## 🚀 Option 1: Instant Install (PWA on Android / iOS) — *Zero setup needed*

You can install BandSync directly onto your phone right now:

### On Android (Chrome, Edge, Samsung Internet):
1. Start your local server or deploy to your cloud server.
2. Open Chrome on your phone and go to your server address (e.g. `http://<your-computer-ip>:3000` or your hosted domain).
3. A banner **"Add BandSync to Home Screen"** or **"Install App"** will appear at the bottom.
4. Tap **Install**.
5. The app icon will appear on your phone's home screen and app drawer, running full-screen in native standalone mode with offline support!

### On iPhone (Safari):
1. Open Safari and navigate to your server address.
2. Tap the **Share** button (box with an upward arrow).
3. Tap **Add to Home Screen**.

---

## 📦 Option 2: Native Android APK (Capacitor Native Build)

The full native Android project has been generated in `./android`.

### Method A: Build APK with Android Studio (Visual One-Click)
1. In your project terminal, run:
   ```bash
   npm run cap:open
   ```
   *(This opens the `android/` project inside Android Studio)*.
2. Inside Android Studio, click **Build** in the top menu -> **Build Bundle(s) / APK(s)** -> **Build APK(s)**.
3. Once finished, click **"locate"** in the popup notification to get your `app-debug.apk` file.
4. Transfer `app-debug.apk` to your phone via USB cable, Google Drive, WhatsApp, or email, tap it on your phone, and install!

### Method B: Command-Line APK Build
Whenever you update your web code, sync and build with:
```bash
# 1. Sync latest web assets to Android
npm run cap:sync

# 2. Build Debug APK
cd android
./gradlew assembleDebug
```
Your compiled APK will be located at:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 🛠️ Summary of npm scripts

| Command | Description |
|---|---|
| `npm run start` | Start the Express + MongoDB backend server |
| `npm run build:app` | Copy web assets to `www/` for mobile builds |
| `npm run cap:sync` | Build web assets and sync to native Android project |
| `npm run cap:open` | Open the native project in Android Studio |
