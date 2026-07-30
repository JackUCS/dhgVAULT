const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Read credentials from Railway environment variables
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

// Debug: log credentials in Railway deploy logs (remove after testing)
console.log('🔐 Auth debug:');
console.log('   ADMIN_USER =', ADMIN_USER);
console.log('   ADMIN_PASS =', ADMIN_PASS ? '(set)' : '(MISSING)');
if (!ADMIN_PASS) {
    console.error('❌ ADMIN_PASS environment variable is not set!');
}

// ---- Clean‑URL middleware: map /disclaimer → disclaimer.html etc. ----
app.use((req, res, next) => {
    // If the request has no file extension and is not the root, rewrite to .html
    if (!path.extname(req.path) && req.path !== '/') {
        // Special case: /admin should still be caught by basicAuth later,
        // but we'll rewrite it to /admin.html so the auth middleware matches.
        if (req.path === '/admin') {
            req.url = '/admin.html';
        } else {
            req.url = req.path + '.html';
        }
    }
    next();
});

// 1. Protect /admin.html (and now also /admin thanks to the rewrite)
app.use('/admin.html', basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },
    challenge: true,
    realm: 'DHGateVault Admin'
}));

// 2. Serve static files (HTML, CSS, JS, images)
app.use(express.static(__dirname));

// 3. Fallback for any other route (just in case)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, req.path));
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});