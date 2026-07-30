const express = require('express');
const basicAuth = require('express-basic-auth');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS;

// Serve all static files (HTML, CSS, JS, images)
app.use(express.static(__dirname));

// Password‑protect admin.html with HTTP Basic Auth
app.use('/admin.html', basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },
    challenge: true,
    realm: 'DHGateVault Admin'
}));

// For any other route, send the requested file
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, req.path));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});