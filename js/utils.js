// --- BandSync: UI & Formatting Utilities ---

export function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function getEnsembleLabel(type) {
    switch (type) {
        case 'band1': return 'Band 1';
        case 'band2': return 'Band 2';
        case 'men_of_songs': return 'Men of Songs';
        case 'full': return 'Full Band (Full Roster)';
        case 'custom': return 'Custom Ensemble';
        default: return type;
    }
}

export function getBandLabel(band) {
    switch (band) {
        case 'band1': return 'Band 1';
        case 'band2': return 'Band 2';
        case 'both': return 'Band 1 & 2 (Full Band)';
        case 'men_of_songs': return 'Men of Songs';
        case 'coordinator': return 'Staff / Coordinator';
        default: return band;
    }
}

let toastTimeout = null;
let toastHideTimeout = null;

export function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
    if (toastHideTimeout) {
        clearTimeout(toastHideTimeout);
        toastHideTimeout = null;
    }

    const iconHtml = type === 'error' 
        ? '<i data-lucide="alert-circle" style="width:16px;height:16px;color:#f87171;flex-shrink:0;"></i>'
        : '<i data-lucide="check-circle-2" style="width:16px;height:16px;color:#34d399;flex-shrink:0;"></i>';

    toast.innerHTML = `${iconHtml}<span>${escapeHtml(message)}</span>`;
    toast.className = `toast ${type === 'error' ? 'toast-error' : 'toast-success'}`;
    toast.classList.remove('hidden');

    // Trigger reflow for smooth animation
    void toast.offsetWidth;
    toast.classList.add('show');

    if (window.lucide && window.lucide.createIcons) {
        window.lucide.createIcons();
    }

    // Keep visible for 3.2 seconds so users can comfortably read and process
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        toastHideTimeout = setTimeout(() => {
            if (!toast.classList.contains('show')) {
                toast.classList.add('hidden');
            }
        }, 350);
    }, 3200);
}

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('hidden');
    void modal.offsetWidth; // Force CSS reflow
    modal.classList.add('active');
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
        if (!modal.classList.contains('active')) {
            modal.classList.add('hidden');
        }
    }, 300);
}

export function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

export function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('Summary report copied to clipboard!');
        }).catch(() => fallbackCopy(text));
    } else {
        fallbackCopy(text);
    }
}

export function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
        document.execCommand('copy');
        showToast('Summary report copied to clipboard!');
    } catch (err) {
        showToast('Could not copy report.');
    }
    document.body.removeChild(textArea);
}
