/**
 * Gmail Unsubscribe - Scanner Module
 */

window.GmailCleaner = window.GmailCleaner || {};

GmailCleaner.Scanner = {
    formatDateRange(firstDate, lastDate) {
        /**
         * Parse RFC 2822 date string and format as MM/DD/YYYY
         * Example: "Wed, 15 Nov 2025 10:30:00 +0000" -> "11/15/2025"
         * Returns date range from oldest to newest
         */
        const formatDate = (dateStr) => {
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return null;
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                const y = date.getFullYear();
                return `${m}/${d}/${y}`;
            } catch {
                return null;
            }
        };

        const first = formatDate(firstDate);
        const last = formatDate(lastDate);

        if (!first || !last) return '';
        if (first === last) return first;

        // Compare dates to determine order (oldest to newest)
        const firstDateObj = new Date(firstDate);
        const lastDateObj = new Date(lastDate);

        if (firstDateObj <= lastDateObj) {
            return `${first} to ${last}`;
        } else {
            return `${last} to ${first}`;
        }
    },

    async startScan() {
        if (GmailCleaner.scanning) return;

        const authResponse = await fetch('/api/auth-status');
        const authStatus = await authResponse.json();

        if (!authStatus.logged_in) {
            GmailCleaner.Auth.signIn();
            return;
        }

        GmailCleaner.scanning = true;
        GmailCleaner.UI.showView('unsubscribe');

        const scanBtn = document.getElementById('scanBtn');
        const progressCard = document.getElementById('progressCard');

        scanBtn.disabled = true;
        scanBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" width="18" height="18">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="60" stroke-linecap="round"/>
            </svg>
            Scanning...
        `;
        progressCard.classList.remove('hidden');

        const limit = document.getElementById('emailLimit').value;
        const filters = GmailCleaner.Filters.get();

        try {
            await fetch('/api/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    limit: parseInt(limit),
                    filters: filters
                })
            });
            this.pollProgress();
        } catch (error) {
            alert('Error: ' + error.message);
            this.resetScan();
        }
    },

    async pollProgress() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();

            const progressBar = document.getElementById('progressBar');
            const progressText = document.getElementById('progressText');
            const storageUsed = document.getElementById('storageUsed');
            const storageText = document.getElementById('storageText');

            progressBar.style.width = status.progress + '%';
            progressText.textContent = status.message;
            storageUsed.style.width = status.progress + '%';
            storageText.textContent = status.message;

            if (status.done) {
                if (!status.error) {
                    const resultsResponse = await fetch('/api/results');
                    GmailCleaner.results = await resultsResponse.json();
                    this.displayResults();
                    this.updateResultsBadge();

                    if (GmailCleaner.results.length > 0) {
                        setTimeout(() => GmailCleaner.UI.showView('unsubscribe'), 500);
                    }
                } else {
                    alert('Error: ' + status.error);
                }
                this.resetScan();
            } else {
                setTimeout(() => this.pollProgress(), 300);
            }
        } catch (error) {
            setTimeout(() => this.pollProgress(), 500);
        }
    },

    resetScan() {
        GmailCleaner.scanning = false;
        const scanBtn = document.getElementById('scanBtn');
        scanBtn.disabled = false;
        scanBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            Start Scanning
        `;
    },

    updateResultsBadge() {
        const badge = document.getElementById('resultsBadge');
        badge.textContent = GmailCleaner.results.length;
        badge.style.display = GmailCleaner.results.length > 0 ? 'inline' : 'none';
    },

    displayResults() {
        const resultsList = document.getElementById('resultsList');
        const resultsSection = document.getElementById('resultsSection');
        const noResults = document.getElementById('noResults');

        resultsList.innerHTML = '';

        if (GmailCleaner.results.length === 0) {
            resultsSection.classList.add('hidden');
            noResults.classList.remove('hidden');
            return;
        }

        resultsSection.classList.remove('hidden');
        noResults.classList.add('hidden');

        GmailCleaner.results.forEach((r, i) => {
            const item = document.createElement('div');
            item.className = 'result-item';

            let actionButton;
            let typeLabel;

            if (r.type === 'one-click') {
                actionButton = `<button class="unsub-btn one-click" id="unsub-${i}" onclick="GmailCleaner.Scanner.autoUnsubscribe(${i})">✓ Unsubscribe</button>`;
                typeLabel = `<span class="type-badge type-auto">Auto</span>`;
            } else {
                actionButton = `<button class="unsub-btn manual" id="unsub-${i}" onclick="GmailCleaner.Scanner.openLink(${i})">Open Link →</button>`;
                typeLabel = `<span class="type-badge type-manual">Manual</span>`;
            }

            item.innerHTML = `
                <label class="checkbox-wrapper result-checkbox">
                    <input type="checkbox" class="result-cb" data-index="${i}" data-type="${r.type || 'manual'}">
                    <span class="checkmark"></span>
                </label>
                <div class="result-content">
                    <div class="result-sender">${GmailCleaner.UI.escapeHtml(r.domain)} ${typeLabel}</div>
                    <div class="result-subject">${GmailCleaner.UI.escapeHtml(r.subjects[0] || 'No subject')}</div>
                </div>
                <div class="result-meta">
                    ${r.first_date && r.last_date ? `<div class="result-date-range">${GmailCleaner.Scanner.formatDateRange(r.first_date, r.last_date)}</div>` : ''}
                    <span class="result-count">${r.count} emails</span>
                </div>
                <div class="result-actions">
                    ${actionButton}
                    <button class="unsub-btn delete-btn" id="trash-${i}" onclick="GmailCleaner.Scanner.trashSender(${i})" title="Move every email from this sender to Trash (recoverable for 30 days)">Trash ${r.count}</button>
                </div>
            `;
            resultsList.appendChild(item);
        });
    },

    async autoUnsubscribe(index) {
        const r = GmailCleaner.results[index];
        const btn = document.getElementById('unsub-' + index);

        btn.disabled = true;
        btn.textContent = 'Working...';

        try {
            const response = await fetch('/api/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ domain: r.domain, link: r.link })
            });
            const result = await response.json();

            if (result.success) {
                r.unsubscribed = true;
                btn.textContent = '✓ Done!';
                btn.classList.remove('one-click');
                btn.classList.add('success');
                GmailCleaner.UI.showSuccessToast(`Successfully unsubscribed from ${r.domain}. You should stop receiving their emails.`);
            } else {
                btn.textContent = 'Open →';
                btn.classList.remove('one-click');
                btn.classList.add('manual');
                btn.onclick = () => this.openLink(index);
                btn.disabled = false;
            }
        } catch (error) {
            btn.textContent = 'Open →';
            btn.onclick = () => this.openLink(index);
            btn.disabled = false;
        }
    },

    openLink(index) {
        const r = GmailCleaner.results[index];
        const btn = document.getElementById('unsub-' + index);

        window.open(r.link, '_blank');
        r.unsubscribed = true;
        btn.textContent = 'Opened ↗';
        btn.classList.add('success');
        // Keep button clickable so user can re-open if needed
    },

    toggleSelectAll() {
        const selectAll = document.getElementById('selectAll');
        document.querySelectorAll('.result-cb').forEach(cb => {
            cb.checked = selectAll.checked;
        });
    },

    async unsubscribeSelected() {
        const selected = [];
        document.querySelectorAll('.result-cb:checked').forEach(cb => {
            const index = parseInt(cb.dataset.index);
            const type = cb.dataset.type;
            const btn = document.getElementById('unsub-' + index);
            if (!btn.classList.contains('success')) {
                selected.push({ index, type });
            }
        });

        if (selected.length === 0) {
            alert('No items selected!');
            return;
        }

        const oneClick = selected.filter(s => s.type === 'one-click').length;
        const manual = selected.filter(s => s.type !== 'one-click').length;

        let message = `Selected ${selected.length} senders:\n`;
        if (oneClick > 0) message += `• ${oneClick} will auto-unsubscribe\n`;
        if (manual > 0) message += `• ${manual} will open in new tabs\n`;
        message += `\nContinue?`;

        if (!confirm(message)) return;

        let autoSuccess = 0;
        let manualOpened = 0;

        for (const { index, type } of selected) {
            if (type === 'one-click') {
                await this.autoUnsubscribe(index);
                const btn = document.getElementById('unsub-' + index);
                if (btn.classList.contains('success')) autoSuccess++;
                await new Promise(r => setTimeout(r, 200));
            }
        }

        for (const { index, type } of selected) {
            if (type !== 'one-click') {
                this.openLink(index);
                manualOpened++;
                await new Promise(r => setTimeout(r, 400));
            }
        }

        // Show toast notification
        let toastMessage = '';
        if (autoSuccess > 0 && manualOpened > 0) {
            toastMessage = `Successfully unsubscribed from ${autoSuccess} senders, ${manualOpened} links opened in tabs`;
        } else if (autoSuccess > 0) {
            toastMessage = `Successfully unsubscribed from ${autoSuccess} senders. You should stop receiving their emails.`;
        } else if (manualOpened > 0) {
            toastMessage = `Opened ${manualOpened} unsubscribe links in new tabs. Complete the process on each page.`;
            GmailCleaner.UI.showInfoToast(toastMessage);
        }

        if (toastMessage && (autoSuccess > 0)) {
            GmailCleaner.UI.showSuccessToast(toastMessage);
        }

        // Offer to clear out the mail from the senders just handled
        const handled = selected
            .map(({ index }) => ({ index, r: GmailCleaner.results[index] }))
            .filter(({ r }) => r && r.unsubscribed && !r.trashed);
        if (handled.length > 0) {
            await this.offerTrashForSenders(handled);
        }
    },

    senderQuery(r) {
        // Prefer the exact address; fall back to the domain (matches all addresses at it)
        return (r.email && r.email.trim()) || r.domain;
    },

    markTrashed(index, deleted) {
        const r = GmailCleaner.results[index];
        if (r) r.trashed = true;
        const btn = document.getElementById('trash-' + index);
        if (btn) {
            btn.textContent = deleted === undefined ? 'Trashed' : `Trashed ${deleted}`;
            btn.classList.add('success');
            btn.disabled = true;
        }
    },

    async trashSender(index) {
        const r = GmailCleaner.results[index];
        const btn = document.getElementById('trash-' + index);
        if (!r || !btn || r.trashed) return;

        const sender = this.senderQuery(r);
        if (!confirm(`Move all emails from ${sender} to Trash?\n\nAbout ${r.count} emails. Gmail keeps Trash for 30 days, so this is recoverable.`)) return;

        btn.disabled = true;
        btn.textContent = 'Trashing...';
        try {
            const response = await fetch('/api/delete-emails', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sender })
            });
            const result = await response.json();
            if (result.success) {
                this.markTrashed(index, result.deleted);
                GmailCleaner.UI.showSuccessToast(`Moved ${result.deleted} emails from ${sender} to Trash.`);
            } else {
                btn.disabled = false;
                btn.textContent = `Trash ${r.count}`;
                GmailCleaner.UI.showErrorToast(`Could not trash emails from ${sender}: ${result.message || 'unknown error'}`);
            }
        } catch (error) {
            btn.disabled = false;
            btn.textContent = `Trash ${r.count}`;
            GmailCleaner.UI.showErrorToast(`Could not trash emails from ${sender}: ${error.message}`);
        }
    },

    async offerTrashForSenders(handled) {
        const totalEmails = handled.reduce((n, { r }) => n + (r.count || 0), 0);
        const names = handled.slice(0, 5).map(({ r }) => this.senderQuery(r)).join('\n  ');
        const more = handled.length > 5 ? `\n  ...and ${handled.length - 5} more` : '';
        const ok = confirm(
            `Also move their emails to Trash?\n\n${handled.length} senders, about ${totalEmails} emails:\n  ${names}${more}\n\nGmail keeps Trash for 30 days, so this is recoverable.`
        );
        if (!ok) return;

        const senders = handled.map(({ r }) => this.senderQuery(r));
        handled.forEach(({ index }) => {
            const btn = document.getElementById('trash-' + index);
            if (btn) { btn.disabled = true; btn.textContent = 'Trashing...'; }
        });

        try {
            await fetch('/api/delete-emails-bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ senders })
            });
        } catch (error) {
            GmailCleaner.UI.showErrorToast('Could not start trashing: ' + error.message);
            return;
        }

        GmailCleaner.UI.showInfoToast(`Moving emails from ${senders.length} senders to Trash...`);

        // Poll the shared bulk-delete status until done
        for (let i = 0; i < 600; i++) {
            await new Promise(res => setTimeout(res, 1000));
            let status;
            try {
                const resp = await fetch('/api/delete-bulk-status');
                status = await resp.json();
            } catch (error) {
                continue;
            }
            if (status.done) {
                handled.forEach(({ index }) => this.markTrashed(index));
                if (status.error) {
                    GmailCleaner.UI.showErrorToast(`${status.message || 'Finished with errors'}: ${status.error}`);
                } else {
                    GmailCleaner.UI.showSuccessToast(`Moved ${status.deleted_count} emails from ${senders.length} senders to Trash.`);
                }
                return;
            }
        }
        GmailCleaner.UI.showErrorToast('Trashing is taking longer than expected. Check the Delete Emails tab for progress.');
    },

    exportResults() {
        if (!GmailCleaner.results.length) {
            alert('No results to export');
            return;
        }

        let text = 'Gmail Unsubscribe Links\n' + '='.repeat(50) + '\n\n';
        GmailCleaner.results.forEach((r, i) => {
            text += `${i + 1}. ${r.domain}\n`;
            text += `   Emails: ${r.count}\n`;
            text += `   Link: ${r.link}\n\n`;
        });

        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'unsubscribe_links.txt';
        a.click();
    }
};

// Global shortcuts
function startScan() { GmailCleaner.Scanner.startScan(); }
function toggleSelectAll() { GmailCleaner.Scanner.toggleSelectAll(); }
function unsubscribeSelected() { GmailCleaner.Scanner.unsubscribeSelected(); }
function exportResults() { GmailCleaner.Scanner.exportResults(); }
