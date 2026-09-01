const express = require('express');
const path = require('path');
const requestIp = require('request-ip');
const http = require('http');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase JSON limit for base64 images
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Persistent data directory
const DATA_DIR = process.env.DATA_DIR || __dirname;
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

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
                    res.json({ countryCode: 'US' });  // fallback
                }
            } catch (e) {
                res.json({ countryCode: 'US' });
            }
        });
    }).on('error', () => {
        res.json({ countryCode: 'US' });
    });
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

// ---------- Static files ----------
app.use(express.static(__dirname));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, req.path));
});

app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});