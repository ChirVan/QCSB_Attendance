const fs = require('fs');
const path = require('path');

const wwwDir = path.join(__dirname, 'www');

// Ensure www directory exists and is clean
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Files & Folders to copy
const itemsToCopy = [
  'index.html',
  'style.css',
  'manifest.json',
  'sw.js',
  'app.js',
  'icons',
  'js'
];

for (const item of itemsToCopy) {
  const srcPath = path.join(__dirname, item);
  const destPath = path.join(wwwDir, item);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
  }
}

console.log('✅ Web assets successfully prepared in ./www for Capacitor Android build.');
