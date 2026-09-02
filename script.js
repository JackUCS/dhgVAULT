// ---------- safety wrapper ----------
document.addEventListener('DOMContentLoaded', function () {
    'use strict';

    console.log('✅ DOM ready – starting script');

    const $productsGrid = document.getElementById('productsGrid');
    const $emptyState = document.getElementById('emptyState');
    const $filtersContainer = document.getElementById('filtersContainer');
    const $toastContainer = document.getElementById('toastContainer');
    const $lightboxOverlay = document.getElementById('lightboxOverlay');
    const $lightboxImage = document.getElementById('lightboxImage');
    const $brandSidebar = document.getElementById('brandSidebar');
    const $brandList = document.getElementById('brandList');
    let currentFilter = 'all';
    let currentBrand = null;

    // ---------- currency state ----------
    let currentCurrency = 'USD';
    let currentRate = 1;

    // ---- quick existence check ----
    const missing = [];
    if (!$productsGrid) missing.push('productsGrid');
    if (!$emptyState) missing.push('emptyState');
    if (!$filtersContainer) missing.push('filtersContainer');
    if (!$toastContainer) missing.push('toastContainer');
    if (!$lightboxOverlay) missing.push('lightboxOverlay');
    if (!$lightboxImage) missing.push('lightboxImage');
    if (missing.length) {
        console.error('❌ Missing elements:', missing.join(', '));
        return;
    }
    console.log('✅ All key elements found');

    // ---------- storage keys ----------
    const STORAGE_PRODUCTS = 'dhgatevault_products';
    const STORAGE_ANALYTICS = 'dhgatevault_analytics';
    const STORAGE_VIEWS = 'dhgatevault_pageviews';
    const STORAGE_THEME = 'dhgatevault_theme';
    const STORAGE_VIEWED_IMAGES = 'dhgatevault_viewed_images';
    const STORAGE_WISHLIST = 'dhgatevault_wishlist';

    // ---------- in-memory event buffer ----------
    const eventBuffer = [];

    // ---------- data helpers ----------
    async function getProducts() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/products');
                if (res.ok) return await res.json();
            } catch (e) {
                console.warn('Server product fetch failed, using local storage');
            }
        }
        return JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
    }

    function getAnalytics() {
        try { return JSON.parse(localStorage.getItem(STORAGE_ANALYTICS)) || {}; } catch (e) { return {}; }
    }
    function incrementPageViews() {
        const v = (parseInt(localStorage.getItem(STORAGE_VIEWS)) || 0) + 1;
        localStorage.setItem(STORAGE_VIEWS, v);
    }

    // ----- Enhanced Analytics Tracking (in-memory + server only) -----
    function recordEvent(type, productId, meta = {}) {
        const event = { type, productId, timestamp: new Date().toISOString(), ...meta };
        eventBuffer.push(event);
        if (window.location.protocol.startsWith('http')) {
            fetch('/api/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(event),
                keepalive: true,
            }).catch(() => {});
        }
    }

    // ---------- wishlist functions ----------
    function getWishlist() {
        try { return JSON.parse(localStorage.getItem(STORAGE_WISHLIST) || '[]'); } catch (e) { return []; }
    }
    function saveWishlist(wishlist) {
        localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(wishlist));
    }
    function toggleWishlist(productId) {
        let wishlist = getWishlist();
        const idx = wishlist.indexOf(productId);
        if (idx >= 0) wishlist.splice(idx, 1);
        else wishlist.push(productId);
        saveWishlist(wishlist);
        updateWishlistButtons();
    }
    // Make globally accessible for inline onclick
    window.toggleWishlist = toggleWishlist;

    function updateWishlistButtons() {
        const wishlist = getWishlist();
        document.querySelectorAll('.product-card__wishlist-btn').forEach(btn => {
            const id = btn.dataset.productId;
            if (wishlist.includes(id)) {
                btn.classList.add('active');
                btn.innerHTML = '<i class="bi bi-heart-fill"></i>';
            } else {
                btn.classList.remove('active');
                btn.innerHTML = '<i class="bi bi-heart"></i>';
            }
        });
    }

    // ---------- image view deduplication (session-only) ----------
    const viewedImages = new Set();
    function isUniqueImageView(productId, imageSrc) {
        const key = `${productId}_${imageSrc}`;
        if (viewedImages.has(key)) return false;
        viewedImages.add(key);
        return true;
    }

    // ---------- lightbox ----------
    window.openLightbox = function (src) {
        $lightboxImage.src = src;
        $lightboxOverlay.classList.add('modal-overlay--active');
        try {
            const thumb = document.querySelector(`img[src="${src}"]`);
            const card = thumb?.closest('.product-card');
            const productId = card?.dataset?.productId;
            if (productId && isUniqueImageView(productId, src)) {
                recordEvent('image_view', productId, { image: src });
            }
        } catch (err) {
            console.warn('Image view tracking skipped:', err);
        }
    };
    function closeLightbox() { $lightboxOverlay.classList.remove('modal-overlay--active'); }
    document.getElementById('btnLightboxClose').addEventListener('click', closeLightbox);
    $lightboxOverlay.addEventListener('click', e => {
        if (e.target === $lightboxOverlay) closeLightbox();
    });

    // ---------- toast ----------
    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        $toastContainer.appendChild(t);
        setTimeout(() => t.remove(), 2000);
    }

    // ---------- render ----------
    async function renderProducts(filter = 'all') {
        const products = await getProducts();
        let filtered = products;
        if (filter !== 'all') {
            filtered = filtered.filter(p => p.category === filter);
        }
        if (currentBrand) {
            filtered = filtered.filter(p => p.brand === currentBrand);
        }
        $productsGrid.innerHTML = '';
        if (filtered.length === 0) {
            $productsGrid.style.display = 'none';
            $emptyState.style.display = 'block';
        } else {
            $productsGrid.style.display = '';
            $emptyState.style.display = 'none';
        }
        filtered.forEach(p => $productsGrid.appendChild(createCard(p)));
        updateWishlistButtons();
        convertPrices();
        updateBrandSidebar(products, filter);
    }

    function createCard(p) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = p.id;

        const reviewThumbs = (p.reviewImages || []).map(img =>
            `<img class="product-card__review-thumb" src="${escapeHTML(img)}"
                  onclick="event.stopPropagation(); window.openLightbox('${escapeHTML(img)}')"
                  onerror="this.style.display='none'">`
        ).join('');

        card.innerHTML = `
            <div class="product-card__image-wrap">
                <img class="product-card__main-img" src="${escapeHTML(p.thumbnailUrl)}" alt="${escapeHTML(p.title)}"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22><rect fill=%22%231a1a2e%22 width=%22300%22 height=%22300%22/><text fill=%22%23666%22 x=%2250%25%22 y=%2250%25%22 dy=%22.3em%22>Image</text></svg>'">
                <div class="product-card__dhgate-badge"><i class="bi bi-diamond-fill"></i> DHGate</div>
                <button class="product-card__wishlist-btn" data-product-id="${p.id}" onclick="event.stopPropagation(); toggleWishlist('${p.id}')">
                    <i class="bi bi-heart"></i>
                </button>
                ${(p.reviewImages || []).length > 0 ? `<div style="position:absolute;top:52px;right:12px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);padding:3px 10px;border-radius:5px;font-size:0.65rem;color:#fff;"><i class="bi bi-camera-fill"></i> ${p.reviewImages.length}</div>` : ''}
                <div class="product-card__review-overlay">
                    ${reviewThumbs || '<span style="color:rgba(255,255,255,0.4);font-size:0.7rem;padding:8px;">No review photos yet</span>'}
                </div>
            </div>
            <div class="product-card__body">
                <div class="product-card__title">${escapeHTML(p.title)}</div>
                <div class="product-card__meta">
                    <span class="product-card__price" data-usd-price="${parseFloat(p.price).toFixed(2)}">$${parseFloat(p.price).toFixed(2)}</span>
                    <span style="color:var(--warning);"><i class="bi bi-star-fill"></i> ${p.rating || 4.5}</span>
                </div>
                <div class="product-card__actions">
                    <a href="${escapeHTML(p.affiliateLink)}" class="product-card__affiliate-btn"
                       target="_blank" rel="sponsored"
                       data-product-id="${p.id}"
                       onclick="window._dhgv_click('${p.id}')">
                        <i class="bi bi-cart-fill"></i> Shop Now
                    </a>
                    <button class="product-card__copy-btn" data-copy-link="${escapeHTML(p.affiliateLink)}">
                        <i class="bi bi-clipboard"></i>
                    </button>
                </div>
            </div>`;

        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            const rx = ((y - rect.height / 2) / rect.height) * 7;
            const ry = ((x - rect.width / 2) / rect.width) * 7;
            card.style.transform = `perspective(1000px) rotateX(${-rx}deg) rotateY(${ry}deg) translateY(-5px)`;
        });
        card.addEventListener('mouseleave', () => card.style.transform = '');
        return card;
    }

    // ---------- brand sidebar ----------
    function updateBrandSidebar(products, category) {
        if (!$brandSidebar || !$brandList) return;
        if (category === 'all') {
            $brandSidebar.style.display = 'none';
            return;
        }
        const brands = [...new Set(products.filter(p => p.category === category).map(p => p.brand).filter(Boolean))];
        if (brands.length === 0) {
            $brandSidebar.style.display = 'none';
            return;
        }
        $brandSidebar.style.display = 'block';
        $brandList.innerHTML = '<button class="brand-item active" data-brand="">All Brands</button>';
        brands.forEach(brand => {
            $brandList.innerHTML += `<button class="brand-item" data-brand="${brand}">${brand}</button>`;
        });
        const buttons = $brandList.querySelectorAll('.brand-item');
        buttons.forEach(btn => {
            if (btn.dataset.brand === (currentBrand || '')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    $brandList?.addEventListener('click', e => {
        const btn = e.target.closest('.brand-item');
        if (!btn) return;
        currentBrand = btn.dataset.brand || null;
        document.querySelectorAll('.brand-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts(currentFilter);
    });

    // ---------- currency localization ----------
    const currencyMap = {
        US: 'USD', GB: 'GBP', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR',
        IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', CA: 'CAD', AU: 'AUD',
        NZ: 'NZD', JP: 'JPY', CN: 'CNY', IN: 'INR', BR: 'BRL', MX: 'MXN',
        SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK',
    };

    async function fetchCurrencyCode() {
        try {
            const res = await fetch('/api/location');
            const data = await res.json();
            if (data.countryCode && data.countryCode !== 'US') return currencyMap[data.countryCode] || 'USD';
        } catch {}
        const lang = navigator.language || navigator.userLanguage;
        const region = lang.split('-')[1]?.toUpperCase();
        if (region && currencyMap[region]) return currencyMap[region];
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz.startsWith('Europe/London')) return 'GBP';
        if (tz.startsWith('Europe/')) return 'EUR';
        if (tz.startsWith('America/')) return 'USD';
        if (tz.startsWith('Asia/Tokyo')) return 'JPY';
        return 'USD';
    }

    const staticRates = {
        USD: 1, GBP: 0.79, EUR: 0.92, CAD: 1.35, AUD: 1.50, NZD: 1.62,
        JPY: 145.0, CNY: 7.2, INR: 82.0, BRL: 5.0, MXN: 17.5, SEK: 10.5,
        NOK: 10.0, DKK: 6.9, CHF: 0.88, PLN: 4.0, CZK: 22.5,
    };

    async function fetchExchangeRate(currency) {
        try {
            const res = await fetch(`https://open.er-api.com/v6/latest/USD`);
            const data = await res.json();
            return data.rates[currency] || staticRates[currency] || 1;
        } catch {
            return staticRates[currency] || 1;
        }
    }

    async function convertPrices() {
        const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: currentCurrency });
        document.querySelectorAll('.product-card__price').forEach(el => {
            const usd = parseFloat(el.dataset.usdPrice);
            if (!isNaN(usd)) el.textContent = formatter.format(usd * currentRate);
        });
    }

    async function initCurrency() {
        const cookieCurrency = document.cookie.split('; ').find(row => row.startsWith('preferred_currency='))?.split('=')[1];
        let currency = cookieCurrency || (await fetchCurrencyCode());
        currentCurrency = currency;
        currentRate = await fetchExchangeRate(currency);
        document.cookie = `preferred_currency=${currency};max-age=31536000;path=/`;
        updateCurrencyDisplay(currency);
        convertPrices();

        const dropdown = document.getElementById('currencyDropdown');
        const trigger = dropdown?.querySelector('.currency-dropdown__trigger');
        const menu = document.getElementById('currencyMenu');
        trigger?.addEventListener('click', () => dropdown.classList.toggle('open'));
        document.addEventListener('click', (e) => {
            if (!dropdown?.contains(e.target)) dropdown?.classList.remove('open');
        });
        menu?.addEventListener('click', async (e) => {
            const option = e.target.closest('.currency-option');
            if (!option) return;
            const selected = option.dataset.currency;
            currentCurrency = selected;
            currentRate = await fetchExchangeRate(selected);
            document.cookie = `preferred_currency=${selected};max-age=31536000;path=/`;
            updateCurrencyDisplay(selected);
            convertPrices();
            dropdown.classList.remove('open');
        });
    }

    function updateCurrencyDisplay(currency) {
        const display = document.getElementById('currencyDisplay');
        if (display) {
            const symbol = { USD: '$', GBP: '£', EUR: '€', CAD: '$', AUD: '$', JPY: '¥', CNY: '¥' };
            display.textContent = currency + ' ' + (symbol[currency] || '');
        }
    }

    // ---------- copy / click handlers ----------
    function legacyCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '0';
        textarea.style.top = '0';
        textarea.style.width = '1px';
        textarea.style.height = '1px';
        textarea.style.opacity = '0.01';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try { document.execCommand('copy'); showToast('Affiliate link copied!'); } catch (err) { alert('Copy failed – please copy the link manually.'); }
        document.body.removeChild(textarea);
    }

    $productsGrid.addEventListener('click', e => {
        const copyBtn = e.target.closest('.product-card__copy-btn');
        if (!copyBtn) return;
        e.preventDefault();
        const rawLink = copyBtn.getAttribute('data-copy-link') || '';
        const decoder = document.createElement('textarea');
        decoder.innerHTML = rawLink;
        const cleanLink = decoder.value;
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(cleanLink).then(() => showToast('Affiliate link copied!')).catch(() => legacyCopy(cleanLink));
        } else {
            legacyCopy(cleanLink);
        }
    });

    function escapeHTML(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    window._dhgv_click = function (id) {
        recordEvent('click', id, { link: document.querySelector(`a[data-product-id="${id}"]`)?.href || '' });
    };

    // ---------- filters ----------
    $filtersContainer.addEventListener('click', e => {
        if (e.target.classList.contains('filter-pill')) {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('filter-pill--active'));
            e.target.classList.add('filter-pill--active');
            currentFilter = e.target.dataset.category;
            currentBrand = null;   // reset brand when category changes
            renderProducts(currentFilter);
        }
    });

    // ---------- cross-tab sync ----------
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_PRODUCTS) renderProducts(currentFilter);
    });

    // ---------- theme toggle ----------
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle?.querySelector('i');
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_THEME, theme);
        if (themeIcon) themeIcon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
    }
    const savedTheme = localStorage.getItem(STORAGE_THEME) || 'dark';
    setTheme(savedTheme);
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // ---------- start everything ----------
    incrementPageViews();
    renderProducts().then(() => initCurrency());
    console.log('🚀 Storefront ready – buttons should work now.');
});

// Cookie consent
document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookieConsent');
    if (cookieBanner) {
        if (localStorage.getItem('cookie_consent')) cookieBanner.style.display = 'none';
        document.getElementById('cookieAccept').addEventListener('click', () => {
            cookieBanner.style.display = 'none';
            localStorage.setItem('cookie_consent', 'true');
        });
    }
});

// Subtle cursor glow
const glow = document.getElementById('cursorGlow');
if (glow && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    glow.style.display = 'block';
    document.addEventListener('mousemove', e => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
    });
}

