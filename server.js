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

// 1. Protect /admin.html BEFORE serving static files
app.use('/admin.html', basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },   // dynamic user:pass from env
    challenge: true,                       // show browser login dialog
    realm: 'DHGateVault Admin'
}));

// 2. Now serve all other files (CSS, JS, images, other HTML)
app.use(express.static(__dirname));

// 3. Fallback for any other route (just in case)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, req.path));
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});