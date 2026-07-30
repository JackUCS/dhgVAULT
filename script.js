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
    let currentFilter = 'all';

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
    const STORAGE_THEME = 'dhgatevault_theme';   // new

    // ---------- data helpers ----------
    function getProducts() {
        try { return JSON.parse(localStorage.getItem(STORAGE_PRODUCTS)) || []; } catch (e) { return []; }
    }
    function getAnalytics() {
        try { return JSON.parse(localStorage.getItem(STORAGE_ANALYTICS)) || {}; } catch (e) { return {}; }
    }
    function incrementPageViews() {
        const v = (parseInt(localStorage.getItem(STORAGE_VIEWS)) || 0) + 1;
        localStorage.setItem(STORAGE_VIEWS, v);
    }
    function recordClick(productId) {
        const a = getAnalytics();
        if (!a[productId]) a[productId] = { clicks: 0, lastClicked: null };
        a[productId].clicks++;
        a[productId].lastClicked = new Date().toISOString();
        localStorage.setItem(STORAGE_ANALYTICS, JSON.stringify(a));
    }

    // ---------- lightbox ----------
    window.openLightbox = function (src) {
        $lightboxImage.src = src;
        $lightboxOverlay.classList.add('modal-overlay--active');
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
    function renderProducts(filter = 'all') {
        const products = getProducts();
        const filtered = filter === 'all' ? products : products.filter(p => p.category === filter);
        $productsGrid.innerHTML = '';
        if (filtered.length === 0) {
            $productsGrid.style.display = 'none';
            $emptyState.style.display = 'block';
        } else {
            $productsGrid.style.display = '';
            $emptyState.style.display = 'none';
        }
        filtered.forEach(p => $productsGrid.appendChild(createCard(p)));
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
                ${(p.reviewImages || []).length > 0 ? `<div style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);padding:3px 10px;border-radius:5px;font-size:0.65rem;color:#fff;"><i class="bi bi-camera-fill"></i> ${p.reviewImages.length}</div>` : ''}
                <div class="product-card__review-overlay">
                    ${reviewThumbs || '<span style="color:rgba(255,255,255,0.4);font-size:0.7rem;padding:8px;">No review photos yet</span>'}
                </div>
            </div>
            <div class="product-card__body">
                <div class="product-card__title">${escapeHTML(p.title)}</div>
                <div class="product-card__meta">
                    <span class="product-card__price">$${parseFloat(p.price).toFixed(2)}</span>
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

        // tilt
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

    // ---------- robust copy ----------
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
        try {
            const ok = document.execCommand('copy');
            if (ok) {
                showToast('Affiliate link copied!');
            } else {
                alert('Copy failed – please copy the link manually.');
            }
        } catch (err) {
            alert('Copy failed – please copy the link manually.');
        }
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
            navigator.clipboard.writeText(cleanLink)
                .then(() => showToast('Affiliate link copied!'))
                .catch(() => legacyCopy(cleanLink));
        } else {
            legacyCopy(cleanLink);
        }
    });

    function escapeHTML(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

    window._dhgv_click = function (id) { recordClick(id); };

    // ---------- filters ----------
    $filtersContainer.addEventListener('click', e => {
        if (e.target.classList.contains('filter-pill')) {
            document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('filter-pill--active'));
            e.target.classList.add('filter-pill--active');
            currentFilter = e.target.dataset.category;
            renderProducts(currentFilter);
        }
    });

    // ---------- cross‑tab sync ----------
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_PRODUCTS) {
            renderProducts(currentFilter);
        }
    });

    // ---------- theme toggle ----------
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle?.querySelector('i');
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_THEME, theme);
        if (themeIcon) {
            themeIcon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
        }
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
    renderProducts();
    console.log('🚀 Storefront ready – buttons should work now.');
});

// Cookie consent (runs after DOM ready as well, but we can keep it separate)
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

// Subtle cursor glow (desktop only)
const glow = document.getElementById('cursorGlow');
if (glow && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    glow.style.display = 'block';
    document.addEventListener('mousemove', e => {
        glow.style.left = e.clientX + 'px';
        glow.style.top = e.clientY + 'px';
    });
}