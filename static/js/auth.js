/**
 * Gmail Unsubscribe - Authentication Module
 */

window.GmailCleaner = window.GmailCleaner || {};

GmailCleaner.Auth = {
    async checkStatus() {
        try {
            const response = await fetch('/api/auth-status');
            const status = await response.json();
            this.updateUI(status);
        } catch (error) {
            console.error('Error checking auth status:', error);
            GmailCleaner.UI.showView('login');
        }
    },

    updateUI(authStatus) {
        const userSection = document.getElementById('userSection');

        if (authStatus.logged_in && authStatus.email) {
            const safeEmail = GmailCleaner.UI.escapeHtml(authStatus.email);
            const initial = authStatus.email.charAt(0).toUpperCase();
            userSection.innerHTML = `
                <span class="user-email">${safeEmail}</span>
                <div class="user-avatar" onclick="GmailCleaner.Auth.showUserMenu()" title="${safeEmail}">${initial}</div>
                <button class="btn btn-sm btn-secondary" onclick="GmailCleaner.Auth.signOut()">Sign Out</button>
            `;
            GmailCleaner.Filters.showBar(true);
            GmailCleaner.UI.showView('unsubscribe');

            // Load labels for filter dropdown
            this.loadLabelsForFilter();
        } else {
            userSection.innerHTML = '';
            GmailCleaner.Filters.showBar(false);
            GmailCleaner.UI.showView('login');
            this.showAuthError(authStatus.error);
        }
    },

    showAuthError(message) {
        const box = document.getElementById('authErrorBox');
        if (!box) return;
        if (!message) { box.hidden = true; box.textContent = ''; return; }
        box.textContent = message;
        box.hidden = false;
    },

    async loadLabelsForFilter() {
        try {
            // Load labels using the Labels module
            const labels = await GmailCleaner.Labels.loadLabels();
            if (labels && labels.user) {
                GmailCleaner.Filters.populateLabelDropdown(labels.user);
            }
        } catch (error) {
            console.error('Error loading labels for filter:', error);
        }
    },

    async signIn() {
        const signInBtn = document.getElementById('signInBtn');

        if (signInBtn) {
            signInBtn.disabled = true;
            signInBtn.innerHTML = '<span>Signing in...</span>';
        }

        try {
            const statusResp = await fetch('/api/web-auth-status');
            const status = await statusResp.json();

            // Check if credentials exist
            if (!status.has_credentials) {
                this.resetSignInButton();
                alert('credentials.json not found!\n\nSetup instructions:\n1. Go to https://console.cloud.google.com/\n2. Create project → Enable Gmail API\n3. Create OAuth credentials (Desktop app)\n4. Download JSON → rename to credentials.json\n5. Put credentials.json in the app folder\n6. Restart the app');
                return;
            }

            if (status.web_auth_mode) {
                // Headless/Docker mode: the server cannot open a browser, so start
                // the flow and show the Google authorization link in the page.
                const signInResp = await fetch('/api/sign-in', { method: 'POST' });
                const signInResult = await signInResp.json();
                if (signInResult.error) {
                    this.resetSignInButton();
                    alert('Sign-in error: ' + signInResult.error);
                    return;
                }

                const url = await this.waitForAuthUrl();
                if (url) {
                    this.showAuthLink(url);
                } else {
                    this.resetSignInButton();
                    alert('Could not get the Google sign-in link from the server. Check the container logs and try again.');
                    return;
                }

                this.pollStatus();
                return;
            }

            const signInResp = await fetch('/api/sign-in', { method: 'POST' });
            const signInResult = await signInResp.json();

            if (signInResult.error) {
                this.resetSignInButton();
                alert('Sign-in error: ' + signInResult.error);
                return;
            }

            this.pollStatus();
        } catch (error) {
            alert('Error signing in: ' + error.message);
            this.resetSignInButton();
        }
    },

    async pollStatus(attempts = 0) {
        const maxAttempts = 120;
        const signInBtn = document.getElementById('signInBtn');

        try {
            const response = await fetch('/api/auth-status');
            const status = await response.json();

            if (status.logged_in) {
                this.hideAuthLink();
                this.updateUI(status);
            } else if (status.error) {
                // Google accepted the sign-in but the Gmail API call failed; stop waiting and say why.
                this.resetSignInButton();
                this.showAuthError(status.error);
            } else if (attempts < maxAttempts) {
                setTimeout(() => this.pollStatus(attempts + 1), 1000);
            } else {
                this.resetSignInButton();
                alert('Sign-in timed out. Please try again.');
            }
        } catch (error) {
            console.error('Error polling auth status:', error);
            setTimeout(() => this.pollStatus(attempts + 1), 1000);
        }
    },

    async waitForAuthUrl(attempts = 30) {
        for (let i = 0; i < attempts; i++) {
            try {
                const resp = await fetch('/api/web-auth-status');
                const status = await resp.json();
                if (status.pending_auth_url) return status.pending_auth_url;
            } catch (error) {
                console.error('Error fetching auth URL:', error);
            }
            await new Promise(r => setTimeout(r, 500));
        }
        return null;
    },

    showAuthLink(url) {
        const box = document.getElementById('authLinkBox');
        if (!box) return;
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.rel = 'noopener';
        a.className = 'btn btn-primary btn-large';
        a.textContent = 'Continue with Google \u2192';
        const hint = document.createElement('p');
        hint.className = 'auth-hint';
        hint.textContent = 'Opens Google in a new tab. Approve access there; this page signs in automatically. The link is valid for 5 minutes.';
        box.replaceChildren(a, hint);
        box.hidden = false;
        const signInBtn = document.getElementById('signInBtn');
        if (signInBtn) signInBtn.innerHTML = '<span>Waiting for Google approval...</span>';
    },

    hideAuthLink() {
        const box = document.getElementById('authLinkBox');
        if (box) { box.hidden = true; box.replaceChildren(); }
    },

    resetSignInButton() {
        this.hideAuthLink();
        const signInBtn = document.getElementById('signInBtn');
        if (signInBtn) {
            signInBtn.disabled = false;
            signInBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"/>
            </svg>
            Sign in with Google`;
        }
    },

    async checkWebAuthMode() {
        // No longer needed - sign in works everywhere now!
        return;
    },

    async signOut() {
        if (!confirm('Sign out of your Gmail account?')) return;

        try {
            await fetch('/api/sign-out', { method: 'POST' });
            GmailCleaner.results = [];
            GmailCleaner.Scanner.updateResultsBadge();
            GmailCleaner.Scanner.displayResults();
            document.getElementById('selectAll').checked = false;
            this.checkStatus();
        } catch (error) {
            alert('Error signing out: ' + error.message);
        }
    },

    showUserMenu() {
        console.log('User menu clicked');
    }
};

// Global shortcuts for onclick handlers
function signIn() { GmailCleaner.Auth.signIn(); }
function signOut() { GmailCleaner.Auth.signOut(); }
