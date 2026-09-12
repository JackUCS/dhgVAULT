// ---------- Cookie helpers (global) ----------
function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name, value, days = 365) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function hasConsent() {
    return getCookie('cookie_consent') === 'accepted' || localStorage.getItem('cookie_consent') === 'true';
}

function getVisitorId() {
    let id = getCookie('visitor_id');
    if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2, 11);
        setCookie('visitor_id', id, 365);
    }
    return id;
}

// ---------- Star HTML ----------
function getStarsHTML(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;
    let stars = '';
    for (let i = 0; i < fullStars; i++) stars += '<i class="bi bi-star-fill" style="font-size:0.8rem;"></i>';
    if (halfStar) stars += '<i class="bi bi-star-half" style="font-size:0.8rem;"></i>';
    for (let i = 0; i < emptyStars; i++) stars += '<i class="bi bi-star" style="font-size:0.8rem;"></i>';
    return stars;
}

// ---------- Escape helper (escapes quotes too) ----------
function escapeHTML(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// ---------- Global event queue ----------
let pendingEvents = [];

function sendEvent(event) {
    if (window.location.protocol.startsWith('http') && hasConsent()) {
        fetch('/api/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(event),
            keepalive: true,
        }).catch(err => console.warn('❌ Event send failed:', err));
    } else {
        pendingEvents.push(event);
    }
}

function flushPendingEvents() {
    if (pendingEvents.length) {
        const eventsToSend = pendingEvents.slice();
        pendingEvents = [];
        eventsToSend.forEach(ev => sendEvent(ev));
    }
}

// ---------- Image proxy helper ----------
function getProxiedImage(url) {
    if (!url) return '';
    if (url.startsWith('/api/image') || url.startsWith('/uploads/') || url.startsWith('data:')) {
        return url;
    }
    return '/api/image?url=' + encodeURIComponent(url);
}

// ---------- Main ----------
document.addEventListener('DOMContentLoaded', function () {
    'use strict';

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

    let currentCurrency = 'USD';
    let currentRate = 1;

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

    const STORAGE_PRODUCTS = 'dhgatevault_products';
    const STORAGE_VIEWS = 'dhgatevault_pageviews';
    const STORAGE_THEME = 'dhgatevault_theme';
    const STORAGE_WISHLIST = 'dhgatevault_wishlist';

    // ---------- Product cache ----------
    let _productCache = null;

    async function getProducts(force = false) {
        if (_productCache && !force) return _productCache;
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/products');
                if (res.ok) {
                    _productCache = await res.json();
                    return _productCache;
                }
            } catch (e) {
                console.warn('Server product fetch failed, using local storage');
            }
        }
        try {
            _productCache = JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
        } catch {
            _productCache = [];
        }
        return _productCache;
    }

    function incrementPageViews() {
        const v = (parseInt(localStorage.getItem(STORAGE_VIEWS)) || 0) + 1;
        localStorage.setItem(STORAGE_VIEWS, v);
        sendEvent({
            type: 'page_view',
            productId: 'site-wide',
            visitorId: getVisitorId(),
            timestamp: new Date().toISOString(),
            count: v,
        });
    }

    function recordEvent(type, productId, meta = {}) {
        sendEvent({
            type,
            productId,
            visitorId: getVisitorId(),
            timestamp: new Date().toISOString(),
            ...meta,
        });
    }

    // ---------- Wishlist ----------
    function getWishlist() {
        try { return JSON.parse(localStorage.getItem(STORAGE_WISHLIST) || '[]'); }
        catch { return []; }
    }
    function saveWishlist(w) {
        localStorage.setItem(STORAGE_WISHLIST, JSON.stringify(w));
    }
    function toggleWishlist(productId) {
        let wishlist = getWishlist();
        const idx = wishlist.indexOf(productId);
        const action = idx >= 0 ? 'removed' : 'added';
        if (idx >= 0) wishlist.splice(idx, 1);
        else wishlist.push(productId);
        saveWishlist(wishlist);
        updateWishlistButtons();
        recordEvent('wishlist', productId, { action });
    }
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

    const viewedImages = new Set();
    function isUniqueImageView(productId, imageSrc) {
        const key = `${productId}_${imageSrc}`;
        if (viewedImages.has(key)) return false;
        viewedImages.add(key);
        return true;
    }

    // ---------- Lightbox ----------
    window.openLightbox = function (src) {
        $lightboxImage.src = getProxiedImage(src);
        $lightboxOverlay.classList.add('modal-overlay--active');
        try {
            const thumb = document.querySelector(`img[src="${src}"]`);
            const card = thumb?.closest('.product-card');
            const productId = card?.dataset?.productId;
            if (productId && isUniqueImageView(productId, src)) {
                recordEvent('image_view', productId, { image: src });
            }
        } catch (err) { /* skip */ }
    };
    function closeLightbox() { $lightboxOverlay.classList.remove('modal-overlay--active'); }
    document.getElementById('btnLightboxClose').addEventListener('click', closeLightbox);
    $lightboxOverlay.addEventListener('click', e => {
        if (e.target === $lightboxOverlay) closeLightbox();
    });

    // ---------- Toast ----------
    function showToast(msg) {
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        $toastContainer.appendChild(t);
        setTimeout(() => t.remove(), 2000);
    }

    // ---------- Render products ----------
    async function renderProducts(filter = 'all') {
        $productsGrid.innerHTML = `
            <div class="product-card skeleton"></div>
            <div class="product-card skeleton"></div>
            <div class="product-card skeleton"></div>
            <div class="product-card skeleton"></div>
        `;
        $productsGrid.style.display = '';
        $emptyState.style.display = 'none';

        const products = await getProducts();
        let filtered = products;
        if (filter !== 'all') filtered = filtered.filter(p => p.category === filter);
        if (currentBrand) filtered = filtered.filter(p => p.brand === currentBrand);

        $productsGrid.innerHTML = '';
        if (filtered.length === 0) {
            $productsGrid.style.display = 'none';
            $emptyState.style.display = 'block';
        } else {
            $productsGrid.style.display = '';
            $emptyState.style.display = 'none';
        }

        if (filtered.length > 0 && filtered[0].thumbnailUrl) {
            const proxiedUrl = getProxiedImage(filtered[0].thumbnailUrl);
            const existing = document.querySelector('link[rel="preload"][as="image"]');
            if (existing) existing.remove();
            const preloadLink = document.createElement('link');
            preloadLink.rel = 'preload';
            preloadLink.as = 'image';
            preloadLink.href = proxiedUrl;
            preloadLink.fetchPriority = 'high';
            document.head.appendChild(preloadLink);
        }

        filtered.forEach((p, index) => $productsGrid.appendChild(createCard(p, index)));
        updateWishlistButtons();
        convertPrices();
        updateBrandSidebar(products, filter);
    }

    function createCard(p, index) {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.dataset.productId = p.id;

        const isAboveFold = index < 4;
        const loadingAttr = isAboveFold ? '' : 'loading="lazy"';
        const fetchPriority = isAboveFold ? 'fetchpriority="high"' : '';
        const proxiedMainImage = getProxiedImage(p.thumbnailUrl);

        const reviewThumbs = (p.reviewImages || []).map(img =>
            `<img class="product-card__review-thumb" src="${escapeHTML(getProxiedImage(img))}"
                alt="${escapeHTML(p.title)} review photo"
                width="44" height="44"
                loading="lazy"
                data-lightbox-src="${escapeHTML(img)}"
                onerror="this.style.display='none'">`
        ).join('');

        card.innerHTML = `
            <div class="product-card__image-wrap">
                <img class="product-card__main-img" src="${escapeHTML(proxiedMainImage)}" alt="${escapeHTML(p.title)}"
                     width="300" height="300"
                     ${loadingAttr}
                     ${fetchPriority}
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22><rect fill=%22%231a1a2e%22 width=%22300%22 height=%22300%22/><text fill=%22%23666%22 x=%2250%25%22 y=%2250%25%22 dy=%22.3em%22>Image</text></svg>'">
                <div class="product-card__dhgate-badge"><i class="bi bi-diamond-fill"></i> DHGate</div>
                <button class="product-card__wishlist-btn" data-product-id="${escapeHTML(p.id)}" aria-label="Add to wishlist">
                    <i class="bi bi-heart" aria-hidden="true"></i>
                </button>
                ${(p.reviewImages || []).length > 0 ? `<div style="position:absolute;top:52px;right:12px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);padding:3px 10px;border-radius:5px;font-size:0.65rem;color:#fff;"><i class="bi bi-camera-fill"></i> ${p.reviewImages.length}</div>` : ''}
                <div class="product-card__review-overlay">
                    ${reviewThumbs || '<span style="color:rgba(255,255,255,0.4);font-size:0.7rem;padding:8px;">No review photos yet</span>'}
                </div>
            </div>
            <div class="product-card__body">
                <div class="product-card__title">${escapeHTML(p.title)}</div>
                <div class="product-card__brand" style="font-size:0.85rem; color:var(--text-muted); margin-top:-4px; margin-bottom:2px;">${escapeHTML(p.brand || '')}</div>
                <div class="product-card__meta">
                    <span class="product-card__price" data-usd-price="${parseFloat(p.price).toFixed(2)}" style="min-width:70px;display:inline-block;">$${parseFloat(p.price).toFixed(2)}</span>
                    <span style="color:var(--warning); display:flex; align-items:center; gap:4px;">
                        ${getStarsHTML(p.rating || 4.5)}
                        <span style="font-size:0.8rem; opacity:0.7;">${p.rating || 4.5}</span>
                    </span>
                </div>
                <div class="product-card__actions">
                    <a href="${escapeHTML(p.affiliateLink)}" class="product-card__affiliate-btn"
                       target="_blank" rel="sponsored"
                       data-product-id="${escapeHTML(p.id)}">
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

    // ---------- Brand sidebar ----------
    function updateBrandSidebar(products, category) {
        if (!$brandSidebar || !$brandList) return;
        if (category === 'all') { $brandSidebar.style.display = 'none'; return; }
        const brands = [...new Set(products.filter(p => p.category === category).map(p => p.brand).filter(Boolean))];
        if (brands.length === 0) { $brandSidebar.style.display = 'none'; return; }
        $brandSidebar.style.display = 'block';
        $brandList.innerHTML = '<button class="brand-item active" data-brand="">All Brands</button>';
        brands.forEach(brand => {
            $brandList.innerHTML += `<button class="brand-item" data-brand="${escapeHTML(brand)}">${escapeHTML(brand)}</button>`;
        });
        $brandList.querySelectorAll('.brand-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.brand === (currentBrand || ''));
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

    // ---------- Currency ----------
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
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            const data = await res.json();
            return data.rates[currency] || staticRates[currency] || 1;
        } catch {
            return staticRates[currency] || 1;
        }
    }

    function convertPrices() {
        const formatter = new Intl.NumberFormat(undefined, { style: 'currency', currency: currentCurrency });
        document.querySelectorAll('.product-card__price').forEach(el => {
            const usd = parseFloat(el.dataset.usdPrice);
            if (!isNaN(usd)) el.textContent = formatter.format(usd * currentRate);
        });
    }

    async function initCurrency() {
        const cookieCurrency = getCookie('preferred_currency');
        const currency = cookieCurrency || (await fetchCurrencyCode());
        currentCurrency = currency;
        currentRate = await fetchExchangeRate(currency);
        setCookie('preferred_currency', currency, 365);
        updateCurrencyDisplay(currency);
        // NOTE: convertPrices() is called by renderProducts — no need to duplicate here

        const dropdown = document.getElementById('currencyDropdown');
        const trigger = dropdown?.querySelector('.currency-dropdown__trigger');
        const menu = document.getElementById('currencyMenu');
        if (!dropdown || !trigger || !menu) return;

        const newTrigger = trigger.cloneNode(true);
        trigger.parentNode.replaceChild(newTrigger, trigger);
        const newMenu = menu.cloneNode(true);
        menu.parentNode.replaceChild(newMenu, menu);

        newTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
        });
        newMenu.addEventListener('click', async (e) => {
            const option = e.target.closest('.currency-option');
            if (!option) return;
            const selected = option.dataset.currency;
            currentCurrency = selected;
            currentRate = await fetchExchangeRate(selected);
            updateCurrencyDisplay(selected);
            setCookie('preferred_currency', selected, 365);
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

    // ---------- Copy handler ----------
    function legacyCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try { document.execCommand('copy'); showToast('Affiliate link copied!'); }
        catch { alert('Copy failed – please copy the link manually.'); }
        document.body.removeChild(textarea);
    }

    $productsGrid.addEventListener('click', e => {
        const copyBtn = e.target.closest('.product-card__copy-btn');
        if (copyBtn) {
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
            return;
        }

        const wishlistBtn = e.target.closest('.product-card__wishlist-btn');
        if (wishlistBtn) {
            e.stopPropagation();
            toggleWishlist(wishlistBtn.dataset.productId);
            return;
        }

        const lightboxThumb = e.target.closest('.product-card__review-thumb');
        if (lightboxThumb) {
            e.stopPropagation();
            window.openLightbox(lightboxThumb.dataset.lightboxSrc);
            return;
        }

        const affiliateBtn = e.target.closest('.product-card__affiliate-btn');
        if (affiliateBtn) {
            recordEvent('click', affiliateBtn.dataset.productId, { link: affiliateBtn.href });
            return;
        }

        const card = e.target.closest('.product-card');
        if (card && card.dataset.productId) {
            const mainImg = card.querySelector('.product-card__main-img');
            if (mainImg) window.openLightbox(mainImg.getAttribute('data-original-src') || mainImg.src);
        }
    });

    // ---------- Filters ----------
    $filtersContainer.addEventListener('click', e => {
        if (e.target.classList.contains('filter-pill')) {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('filter-pill--active'));
            e.target.classList.add('filter-pill--active');
            currentFilter = e.target.dataset.category;
            currentBrand = null;
            renderProducts(currentFilter);
        }
    });

    // ---------- Cross-tab sync ----------
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_PRODUCTS) {
            _productCache = null;
            renderProducts(currentFilter);
        }
    });

    // ---------- Theme ----------
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle?.querySelector('i');
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_THEME, theme);
        const favicon = document.getElementById('favicon');
        if (favicon) {
            favicon.href = theme === 'light' ? '/fav/faviconlight.ico' : '/fav/favicondark.ico';
        }
        if (themeIcon) themeIcon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
    }
    setTheme(localStorage.getItem(STORAGE_THEME) || 'dark');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') || 'dark';
            setTheme(current === 'dark' ? 'light' : 'dark');
        });
    }

    // ---------- Start ----------
    incrementPageViews();
    initCurrency().then(() => renderProducts());
});

// ---------- Cookie consent ----------
document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('cookieConsent');
    const acceptBtn = document.getElementById('cookieAccept');
    if (!banner) return;

    if (hasConsent()) {
        banner.style.display = 'none';
        setTimeout(flushPendingEvents, 500);
    }

    acceptBtn?.addEventListener('click', () => {
        setCookie('cookie_consent', 'accepted', 365);
        localStorage.setItem('cookie_consent', 'true');
        banner.style.display = 'none';
        fetch('/api/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'cookie_consent',
                productId: 'site-wide',
                visitorId: getVisitorId(),
                timestamp: new Date().toISOString()
            })
        }).then(flushPendingEvents).catch(flushPendingEvents);
    });
});

// ---------- Cursor glow ----------
const glow = document.getElementById('cursorGlow');
if (glow && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    glow.style.display = 'block';
    document.addEventListener('mousemove', e => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
    });
}