document.addEventListener('DOMContentLoaded', async () => {
    // Theme toggle
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = themeToggle?.querySelector('i');
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('dhgatevault_theme', theme);
        if (themeIcon) themeIcon.className = theme === 'light' ? 'bi bi-moon-fill' : 'bi bi-sun-fill';
    }
    const savedTheme = localStorage.getItem('dhgatevault_theme') || 'dark';
    setTheme(savedTheme);
    themeToggle?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(current === 'dark' ? 'light' : 'dark');
    });

    const wishlist = JSON.parse(localStorage.getItem('dhgatevault_wishlist') || '[]');
    const grid = document.getElementById('wishlistGrid');
    const empty = document.getElementById('emptyWishlist');
    const countBadge = document.getElementById('wishlistCount');

    function updateEmptyState() {
        if (wishlist.length === 0) {
            grid.style.display = 'none';
            empty.style.display = 'block';
        } else {
            grid.style.display = '';
            empty.style.display = 'none';
        }
    }

    function updateCount() {
        if (countBadge) {
            countBadge.textContent = wishlist.length;
            countBadge.style.display = wishlist.length > 0 ? 'inline' : 'none';
        }
    }

    async function fetchProducts() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/products');
                if (res.ok) return await res.json();
            } catch {}
        }
        return JSON.parse(localStorage.getItem('dhgatevault_products') || '[]');
    }

    const products = await fetchProducts();
    const savedProducts = products.filter(p => wishlist.includes(p.id));

    function renderWishlist() {
        grid.innerHTML = savedProducts.map(p => `
            <div class="product-card">
                <div class="product-card__image-wrap">
                    <img class="product-card__main-img" src="${p.thumbnailUrl}" alt="${p.title}"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22><rect fill=%22%231a1a2e%22 width=%22300%22 height=%22300%22/><text fill=%22%23666%22 x=%2250%25%22 y=%2250%25%22 dy=%22.3em%22>Image</text></svg>'">
                    <div class="product-card__dhgate-badge"><i class="bi bi-diamond-fill"></i> DHGate</div>
                    <button class="product-card__wishlist-btn active" aria-label="Remove from wishlist" onclick="removeFromWishlist('${p.id}')">
                        <i class="bi bi-heart-fill" aria-hidden="true"></i>
                    </button>
                </div>
                <div class="product-card__body">
                    <div class="product-card__title">${p.title}</div>
                    <div class="product-card__meta">
                        <span class="product-card__price">$${parseFloat(p.price).toFixed(2)}</span>
                        <span style="color:var(--warning);"><i class="bi bi-star-fill"></i> ${p.rating || 4.5}</span>
                    </div>
                    <div class="product-card__actions">
                        <a href="${p.affiliateLink}" class="product-card__affiliate-btn" target="_blank" rel="sponsored">
                            <i class="bi bi-cart-fill"></i> Shop Now
                        </a>
                        <button class="product-card__copy-btn" onclick="navigator.clipboard.writeText('${p.affiliateLink}')">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    window.removeFromWishlist = function(productId) {
        const idx = wishlist.indexOf(productId);
        if (idx >= -1) wishlist.splice(idx, 1);
        localStorage.setItem('dhgatevault_wishlist', JSON.stringify(wishlist));
        // Re-render
        savedProducts = products.filter(p => wishlist.includes(p.id));
        renderWishlist();
        updateEmptyState();
        updateCount();
    };

    updateEmptyState();
    updateCount();
    renderWishlist();
});

function updateWishlistCount() {
    const count = getWishlist().length;
    const badge = document.getElementById('wishlistCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
        // Add a quick pop animation
        badge.classList.remove('wishlist-count--pop');
        void badge.offsetWidth; // trigger reflow
        badge.classList.add('wishlist-count--pop');
    }
}