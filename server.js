require('dotenv').config();

const express = require('express');
const path = require('path');
const requestIp = require('request-ip');
const http = require('http');
const fs = require('fs');
const sharp = require('sharp');
const multer = require('multer');
const compression = require('compression');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me-now';

app.use(compression());

// Security Headers
app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Content-Security-Policy',
        "default-src 'self'; " +
        "img-src 'self' data: https:; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net; " +
        "script-src 'self' 'unsafe-inline'; " +
        "connect-src 'self' https://open.er-api.com; " +
        "frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
    );
    next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Data directory
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use('/uploads', express.static(UPLOADS_DIR, {
    maxAge: '30d',
    immutable: true
}));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ---------- 🔥 ADMIN ROUTE – MUST COME BEFORE clean‑URL ----------
const ADMIN_PATH = process.env.ADMIN_PATH || '/dhgate-admin-x7k9p2';

// Block the old /admin path completely (returns 404)
app.use('/admin', (req, res) => res.status(404).end());

// Protect the actual admin.html file (in case someone tries to access it directly)
app.use('/admin.html', basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },
    challenge: true,
    realm: 'Admin Area'
}));

// Protect your custom admin path
app.use(ADMIN_PATH, basicAuth({
    users: { [ADMIN_USER]: ADMIN_PASS },
    challenge: true,
    realm: 'Admin Area'
}));

// Serve the admin page at the custom path
app.get(ADMIN_PATH, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ---- Clean‑URL middleware (now AFTER admin routes) ----
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (!path.extname(req.path) && req.path !== '/') {
        req.url = req.path + '.html';
    }
    next();
});

// ---------- IP Geolocation ----------
app.get('/api/location', (req, res) => {
    const clientIp = requestIp.getClientIp(req);
    const apiUrl = `http://ip-api.com/json/${clientIp}?fields=status,countryCode`;
    http.get(apiUrl, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
            try {
                const json = JSON.parse(data);
                if (json.status === 'success') {
                    res.json({ countryCode: json.countryCode });
                } else {
                    res.json({ countryCode: 'US' });
                }
            } catch (e) {
                res.json({ countryCode: 'US' });
            }
        });
    }).on('error', () => {
        res.json({ countryCode: 'US' });
    });
});

// ---------- Upload Review Photos ----------
app.post('/api/upload-review-photos', upload.array('photos', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        const urls = [];
        for (const file of req.files) {
            const filename = `review-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.webp`;
            const outputPath = path.join(UPLOADS_DIR, filename);
            await sharp(file.buffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(outputPath);
            urls.push(`/uploads/${filename}`);
        }
        res.json({ urls });
    } catch (err) {
        console.error('Upload conversion failed:', err);
        res.status(500).json({ error: 'Conversion failed' });
    }
});

// ---------- 🔥 NEW: Upload Thumbnail (main product image) ----------
app.post('/api/upload-thumbnail', upload.single('thumbnail'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filename = `thumbnail-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.webp`;
        const outputPath = path.join(UPLOADS_DIR, filename);

        await sharp(req.file.buffer)
            .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 70 })
            .toFile(outputPath);

        const url = `/uploads/${filename}`;
        res.json({ url });
    } catch (err) {
        console.error('Thumbnail upload failed:', err);
        res.status(500).json({ error: 'Upload failed' });
    }
});

// ---------- Products API ----------
function readJSON(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        return fallback;
    }
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.get('/api/products', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(readJSON(PRODUCTS_FILE, []));
});

app.post('/api/products', (req, res) => {
    const product = req.body;
    if (!product || !product.id) return res.status(400).json({ error: 'Invalid product' });
    const products = readJSON(PRODUCTS_FILE, []);
    const idx = products.findIndex(p => p.id === product.id);
    if (idx >= 0) products[idx] = product;
    else products.unshift(product);
    writeJSON(PRODUCTS_FILE, products);
    res.json({ success: true });
});

app.delete('/api/products/:id', (req, res) => {
    const id = req.params.id;
    let products = readJSON(PRODUCTS_FILE, []);
    products = products.filter(p => p.id !== id);
    writeJSON(PRODUCTS_FILE, products);
    res.json({ success: true });
});

// ---------- Analytics API ----------
app.post('/api/event', (req, res) => {
    const event = req.body;
    if (!event || !event.type || !event.productId) return res.status(400).json({ error: 'Invalid event' });
    const events = readJSON(EVENTS_FILE, []);
    events.push({ ...event, timestamp: new Date().toISOString() });
    writeJSON(EVENTS_FILE, events);
    res.json({ success: true });
});

app.get('/api/events', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.json(readJSON(EVENTS_FILE, []));
});

app.delete('/api/events', (req, res) => {
    writeJSON(EVENTS_FILE, []);
    res.json({ success: true });
});

// ---------- 🔥 IMAGE PROXY (optimise DHGate images) ----------
app.get('/api/image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) return res.status(400).json({ error: 'Missing url parameter' });

    // Only allow http/https to prevent SSRF
    if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            return res.status(404).json({ error: 'Image not found' });
        }

        const buffer = await response.arrayBuffer();

        const processed = await sharp(Buffer.from(buffer))
            .resize({ width: 400, height: 400, fit: 'inside' })
            .webp({ quality: 70 })
            .toBuffer();

        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Content-Type', 'image/webp');
        res.send(processed);
    } catch (err) {
        console.error('Image proxy error:', err);
        res.status(500).json({ error: 'Image processing failed' });
    }
});

// ---------- Static files ----------
app.use(express.static(__dirname, {
    maxAge: '7d',
    immutable: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache');
        }
    }
}));

app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use('/.well-known', (req, res) => res.status(404).end());

// ---------- 404 fallback ----------
app.use((req, res) => {
    res.status(404).end();
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🔐 Admin panel: http://localhost:${PORT}${ADMIN_PATH}`);
});