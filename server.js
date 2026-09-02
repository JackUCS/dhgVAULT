const express = require('express');
const path = require('path');
const requestIp = require('request-ip');
const http = require('http');
const fs = require('fs');
const sharp = require('sharp');
const multer = require('multer');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable gzip compression for all responses
app.use(compression());

// -------------------------
// Security Headers Middleware
// -------------------------
// Security headers middleware
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

// Reduce JSON limit since we no longer embed base64 images
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// Persistent data directory
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Serve uploaded files with long-term cache (they are immutable once created)
app.use('/uploads', express.static(UPLOADS_DIR, {
    maxAge: '30d',
    immutable: true
}));

// Multer setup (memory storage for processing)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB per file
});

// ---- Clean‑URL middleware ----
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    if (!path.extname(req.path) && req.path !== '/') {
        req.url = req.path === '/admin' ? '/admin.html' : req.path + '.html';
    }
    next();
});

// ---------- IP Geolocation Endpoint ----------
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

// ---------- Upload & Convert to WebP (with resize) ----------
app.post('/api/upload-review-photos', upload.array('photos', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        const urls = [];
        for (const file of req.files) {
            const originalSize = file.buffer.length;
            const filename = `review-${Date.now()}-${Math.random().toString(36).substr(2, 6)}.webp`;
            const outputPath = path.join(UPLOADS_DIR, filename);

            // Resize to max 1200px on longest side, then convert to WebP
            await sharp(file.buffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(outputPath);

            const convertedSize = fs.statSync(outputPath).size;
            console.log(`📸 ${file.originalname}: ${(originalSize/1024).toFixed(1)}KB → ${(convertedSize/1024).toFixed(1)}KB (WebP)`);

            urls.push(`/uploads/${filename}`);
        }

        res.json({ urls });
    } catch (err) {
        console.error('Upload conversion failed:', err);
        res.status(500).json({ error: 'Conversion failed' });
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
    res.json(readJSON(EVENTS_FILE, []));
});

// ---------- Static files with caching ----------
app.use(express.static(__dirname, {
    maxAge: '7d',
    immutable: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache'); // HTML always fresh
        }
    }
}));

// Silently ignore missing favicon and .well-known requests
app.get('/favicon.ico', (req, res) => res.status(204).end());
app.use('/.well-known', (req, res) => res.status(404).end());

// Fallback – silently end if file doesn't exist
app.get('*', (req, res) => {
    const filePath = path.join(__dirname, req.path);
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) return res.status(404).end();
        res.sendFile(filePath);
    });
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});