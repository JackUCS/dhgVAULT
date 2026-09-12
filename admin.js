document.addEventListener('DOMContentLoaded', function() {
    const STORAGE_PRODUCTS = 'dhgatevault_products';
    const STORAGE_ANALYTICS = 'dhgatevault_analytics';
    const STORAGE_VIEWS = 'dhgatevault_pageviews';
    const STORAGE_VAULT_CREDS = 'dhgatevault_vault_creds';
    const STORAGE_EVENTS = 'dhgatevault_events';

    const $toast = document.getElementById('toastContainer');
    let editingId = null;

    function showToast(msg) {
        if (!$toast) return;
        const t = document.createElement('div');
        t.className = 'toast';
        t.textContent = msg;
        $toast.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    async function hashPassword(pw) {
        const e = new TextEncoder();
        const d = await crypto.subtle.digest('SHA-256', e.encode(pw));
        return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 🔥 Helper: Compress image using Canvas API before Base64 conversion
    function compressImage(file, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const scaleSize = maxWidth / img.width;
                    canvas.width = maxWidth;
                    canvas.height = img.height * scaleSize;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                    // Convert to JPEG with specified quality (0.7 = 70%)
                    const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressedBase64);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    function init() {
        const btnLogout = document.getElementById('btnLogout');
        const addForm = document.getElementById('addProductForm');
        const btnSaveVault = document.getElementById('btnSaveVaultCreds');
        const btnResetAnalytics = document.getElementById('btnResetAnalytics');
        const inputDhgateLink = document.getElementById('inputDhgateLink');
        const inputReviewPhotos = document.getElementById('inputReviewPhotos');
        const btnRefresh = document.getElementById('btnRefreshData');

        if (btnLogout) btnLogout.addEventListener('click', () => window.location.href = 'index.html');

        loadData();

        if (addForm) addForm.addEventListener('submit', handleAddProduct);
        if (btnSaveVault) btnSaveVault.addEventListener('click', saveVaultCreds);
        if (btnResetAnalytics) btnResetAnalytics.addEventListener('click', resetAnalytics);
        if (inputDhgateLink) inputDhgateLink.addEventListener('blur', autoFillPrice);
        if (inputReviewPhotos) inputReviewPhotos.addEventListener('change', previewImages);

        if (btnRefresh) {
            btnRefresh.addEventListener('click', async function() {
                this.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refreshing...';
                this.disabled = true;
                try {
                    await loadData();
                    showToast('✅ Data refreshed!');
                } catch (err) {
                    console.error('Refresh failed:', err);
                    showToast('❌ Refresh failed');
                }
                this.innerHTML = '<i class="bi bi-arrow-clockwise"></i> Refresh Data';
                this.disabled = false;
            });
        }

        document.querySelectorAll('.collapsible__trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.collapsible');
                card.classList.toggle('collapsible--open');
                const arrow = btn.querySelector('.collapsible__arrow');
                if (arrow) arrow.classList.toggle('bi-chevron-down');
            });
        });

        document.querySelectorAll('.admin-section').forEach(section => {
            const title = section.querySelector('.admin-section__title');
            if (!title) return;

            if (!title.querySelector('.toggle-icon')) {
                title.innerHTML += ' <i class="bi bi-chevron-down toggle-icon"></i>';
            }
            title.style.cursor = 'pointer';

            const children = Array.from(section.children).filter(child => child !== title);
            if (children.length > 0 && !section.querySelector('.section-content')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'section-content';
                children.forEach(child => wrapper.appendChild(child));
                section.appendChild(wrapper);
            }

            const icon = title.querySelector('.toggle-icon');

            function toggleSection(expand) {
                if (typeof expand === 'undefined') {
                    section.classList.toggle('section-collapsed');
                } else if (expand) {
                    section.classList.remove('section-collapsed');
                } else {
                    section.classList.add('section-collapsed');
                }
                if (icon) {
                    icon.style.transform = section.classList.contains('section-collapsed') ? 'rotate(-90deg)' : 'rotate(0deg)';
                }
                localStorage.setItem(`admin_section_${section.id}`, section.classList.contains('section-collapsed') ? 'collapsed' : 'expanded');
            }

            title.addEventListener('click', () => toggleSection());

            const saved = localStorage.getItem(`admin_section_${section.id}`);
            if (saved === 'collapsed') {
                toggleSection(false);
            } else {
                toggleSection(true);
            }
        });
    }

    window.loadData = loadData;

    async function getProducts() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/products?t=' + Date.now());
                if (res.ok) return await res.json();
            } catch (e) {
                console.warn('Server product fetch failed, falling back to local');
            }
        }
        return JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
    }

    async function upsertProductToServer(product) {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(product)
                });
                return res.ok;
            } catch (e) {
                console.warn('Server upsert failed:', e);
            }
        }
        return false;
    }

    async function deleteProductFromServer(id) {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
                return res.ok;
            } catch (e) {
                console.warn('Server delete failed:', e);
            }
        }
        return false;
    }

    async function getEvents() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const url = '/api/events?t=' + Date.now() + '&r=' + Math.random();
                const res = await fetch(url);
                if (res.ok) return await res.json();
            } catch (e) {
                console.warn('Server events fetch failed:', e);
            }
        }
        return [];
    }

    function calculateMetrics(events) {
        const clickMap = {};
        const viewMap = {};
        const wishlistMap = {};
        let pageViewCount = 0;

        events.forEach(ev => {
            if (ev.type === 'click') {
                clickMap[ev.productId] = (clickMap[ev.productId] || 0) + 1;
            } else if (ev.type === 'image_view') {
                viewMap[ev.productId] = (viewMap[ev.productId] || 0) + 1;
            } else if (ev.type === 'page_view') {
                pageViewCount++;
            } else if (ev.type === 'wishlist') {
                if (ev.action === 'added') {
                    wishlistMap[ev.productId] = (wishlistMap[ev.productId] || 0) + 1;
                }
            }
        });

        return { clickMap, viewMap, wishlistMap, pageViewCount };
    }

    function populateBrandFilter(products) {
        const select = document.getElementById('brandFilter');
        if (!select) return;

        select.innerHTML = '<option value="all">All Brands</option>';
        const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort();

        brands.forEach(brand => {
            const opt = document.createElement('option');
            opt.value = brand;
            opt.textContent = brand;
            select.appendChild(opt);
        });
    }

    function renderBarChart(products, clickMap) {
        const chart = document.getElementById('barChart');
        const tooltip = document.getElementById('chartTooltip');
        if (!chart) return;
        chart.innerHTML = '';

        const totalClicks = Object.values(clickMap).reduce((a, b) => a + b, 0);
        if (totalClicks === 0) {
            chart.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; width:100%; height:100px; color:var(--text-muted);"><i class="bi bi-bar-chart" style="font-size:2rem; margin-bottom:8px; opacity:0.4;"></i><span>No click data yet</span></div>`;
            return;
        }

        const max = Math.max(1, ...products.map(p => clickMap[p.id] || 0));

        function updateTooltipPosition(e) {
            if (!tooltip) return;
            let x = e.clientX, y = e.clientY - 40;
            const tw = tooltip.getBoundingClientRect().width || 150;
            if (x + tw / 2 > window.innerWidth) x = window.innerWidth - tw / 2 - 10;
            if (x - tw / 2 < 0) x = tw / 2 + 10;
            if (y < 10) y = e.clientY + 20;
            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        }

        products.slice(0, 12).forEach(p => {
            const clicks = clickMap[p.id] || 0;
            const bar = document.createElement('div');
            bar.className = 'bar-chart__bar';
            const calculatedHeight = Math.max(12, (clicks / max) * 120);
            bar.style.height = calculatedHeight + 'px';
            bar.setAttribute('data-clicks', clicks);
            bar.setAttribute('data-title', p.title);

            bar.addEventListener('mouseenter', function(e) {
                if (tooltip) {
                    tooltip.textContent = `${p.title}: ${clicks} clicks`;
                    tooltip.classList.add('visible');
                    tooltip.style.display = 'block';
                    updateTooltipPosition(e);
                }
            });
            bar.addEventListener('mousemove', function(e) {
                if (tooltip && tooltip.classList.contains('visible')) updateTooltipPosition(e);
            });
            bar.addEventListener('mouseleave', function() {
                if (tooltip) { tooltip.classList.remove('visible'); tooltip.style.display = 'none'; }
            });

            const label = document.createElement('div');
            label.className = 'bar-chart__label';
            label.textContent = p.title.substr(0, 8);

            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;min-width:20px;';
            wrap.appendChild(bar);
            wrap.appendChild(label);
            chart.appendChild(wrap);
        });
    }

    async function loadData() {
        const products = await getProducts();
        const events = await getEvents();
        const { clickMap, viewMap, wishlistMap, pageViewCount } = calculateMetrics(events);

        document.getElementById('adminTotalProducts').textContent = products.length;
        document.getElementById('adminTotalClicks').textContent = Object.values(clickMap).reduce((s, c) => s + c, 0);
        document.getElementById('adminTotalViews').textContent = pageViewCount || 0;

        const totalWishlists = Object.values(wishlistMap).reduce((sum, val) => sum + val, 0);
        const wishlistStatEl = document.getElementById('adminTotalWishlists');
        if (wishlistStatEl) wishlistStatEl.textContent = totalWishlists;

        let top = '—', topC = 0;
        products.forEach(p => {
            const c = clickMap[p.id] || 0;
            if (c > topC) { topC = c; top = p.title.substr(0, 25); }
        });
        document.getElementById('adminTopProduct').textContent = top;

        renderBarChart(products, clickMap);
        populateBrandFilter(products);

        const brandFilter = document.getElementById('brandFilter');
        if (brandFilter) {
            brandFilter.onchange = function() { renderTable(products, clickMap, wishlistMap); };
        }
        renderTable(products, clickMap, wishlistMap);

        const creds = JSON.parse(localStorage.getItem(STORAGE_VAULT_CREDS) || '{}');
        if (creds.username) document.getElementById('vaultUsernameInput').value = creds.username;
        return true;
    }

    function renderTable(products, clickMap, wishlistMap) {
        const tbody = document.getElementById('adminTableBody');
        if (!tbody) return;

        const brandFilter = document.getElementById('brandFilter');
        const selectedBrand = brandFilter?.value || 'all';

        let filtered = products;
        if (selectedBrand !== 'all') filtered = products.filter(p => p.brand === selectedBrand);

        const sorted = [...filtered].sort((a, b) => (clickMap[b.id] || 0) - (clickMap[a.id] || 0));

        tbody.innerHTML = '';
        sorted.forEach(p => {
            const clicks = clickMap[p.id] || 0;
            const wishlists = wishlistMap[p.id] || 0;
            const priority = clicks >= 10 ? '🔥 High' : clicks >= 4 ? '⭐ Medium' : 'Low';

            tbody.innerHTML += `<tr>
                <td>${p.title.substr(0, 30)}</td>
                <td>${p.category}</td>
                <td>${p.brand || '—'}</td>
                <td><strong>${clicks}</strong></td>
                <td><strong>${wishlists}</strong></td>
                <td>${priority}</td>
                <td>
                    <button class="btn btn--ghost btn--sm" onclick="editProduct('${p.id}')" title="Edit"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn--ghost btn--sm btn--danger" onclick="deleteProduct('${p.id}')" title="Delete"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        });
    }

    async function handleAddProduct(e) {
        e.preventDefault();
        let existingProduct = null;
        if (editingId) {
            const products = await getProducts();
            existingProduct = products.find(p => p.id === editingId);
        }

        const thumbnailFile = document.getElementById('inputThumbnailFile');
        const thumbnailUrlInput = document.getElementById('inputThumbnailUrl');
        let thumbnailUrl = thumbnailUrlInput.value.trim();

        // 🔥 Compress and convert thumbnail to base64
        if (thumbnailFile && thumbnailFile.files.length > 0) {
            const file = thumbnailFile.files[0];
            try {
                thumbnailUrl = await compressImage(file, 600, 0.7); // Max 600px wide, 70% quality
                showToast('✅ Thumbnail uploaded and compressed!');
            } catch (err) {
                console.error('❌ Thumbnail compression failed:', err);
                showToast('❌ Upload failed: ' + err.message);
                return;
            }
        }

        if (!thumbnailUrl) {
            showToast('❌ Please provide a thumbnail URL or upload an image.');
            return;
        }

        // Handle review photos - also compress them!
        const files = document.getElementById('inputReviewPhotos')?.files || [];
        let reviewImages = existingProduct?.reviewImages || [];
        if (files.length > 0) {
            const newImages = [];
            for (let f of files) {
                try {
                    const compressed = await compressImage(f, 1200, 0.7); // Max 1200px wide, 70% quality
                    newImages.push(compressed);
                } catch (err) {
                    console.warn('Failed to compress review photo:', err);
                }
            }
            reviewImages = newImages;
        }

        const productData = {
            dhgateLink: document.getElementById('inputDhgateLink').value,
            thumbnailUrl: thumbnailUrl,
            title: document.getElementById('inputTitle').value,
            price: document.getElementById('inputPrice').value,
            affiliateLink: document.getElementById('inputAffiliateLink').value,
            category: document.getElementById('inputCategory').value,
            brand: document.getElementById('inputBrand').value.trim(),
            rating: document.getElementById('inputRating').value,
            reviewImages: reviewImages,
            createdAt: existingProduct?.createdAt || new Date().toISOString()
        };

        const product = { id: editingId || 'prod_' + Date.now(), ...productData };
        await upsertProductToServer(product);

        const localProduct = { ...product };
        delete localProduct.reviewImages; // Don't cache review images in localStorage to prevent quota errors
        try {
            let products = JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
            const idx = products.findIndex(p => p.id === localProduct.id);
            if (idx >= 0) products[idx] = localProduct;
            else products.unshift(localProduct);
            localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));
        } catch (err) { console.warn('Local cache skipped'); }

        showToast(editingId ? '✅ Product updated!' : '✅ Product added!');
        editingId = null;
        document.querySelector('#addProductForm button[type="submit"]').innerHTML = '<i class="bi bi-cloud-upload"></i> Add Product';

        await loadData();
        e.target.reset();
        document.getElementById('reviewPreviews').innerHTML = '';
        if (thumbnailFile) thumbnailFile.value = '';
    }

    function autoFillPrice() {
        const link = document.getElementById('inputDhgateLink')?.value;
        const priceInput = document.getElementById('inputPrice');
        if (!link || priceInput?.value) return;
        let h = 0; for (let i = 0; i < link.length; i++) h = ((h << 5) - h) + link.charCodeAt(i);
        priceInput.value = ((Math.abs(h) % 10500) / 100 + 15).toFixed(2);
    }

    function previewImages() {
        const container = document.getElementById('reviewPreviews');
        if (!container) return;
        container.innerHTML = '';
        for (let f of this.files) {
            const r = new FileReader();
            r.onload = e => { const img = document.createElement('img'); img.src = e.target.result; container.appendChild(img); };
            r.readAsDataURL(f);
        }
    }

    function saveVaultCreds() {
        const u = document.getElementById('vaultUsernameInput')?.value.trim();
        const p = document.getElementById('vaultPasswordInput')?.value;
        if (!u || !p) return showToast('Enter both.');
        hashPassword(p).then(hash => {
            localStorage.setItem(STORAGE_VAULT_CREDS, JSON.stringify({ username: u, passwordHash: hash }));
            showToast('Vault credentials saved.');
        });
    }

    function resetAnalytics() {
        if (!confirm('Reset all analytics?')) return;
        fetch('/api/events', { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast('✅ Analytics reset!');
                localStorage.removeItem(STORAGE_ANALYTICS);
                localStorage.removeItem(STORAGE_EVENTS);
                loadData();
            } else showToast('❌ Reset failed');
        })
        .catch(err => { console.error('Reset error:', err); showToast('❌ Reset failed'); });
    }

    window.deleteProduct = async function(id) {
        if (!confirm('Delete this product?')) return;
        await deleteProductFromServer(id);
        let products = JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
        products = products.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));
        await loadData();
        showToast('🗑️ Product deleted');
    };

    window.editProduct = async function(id) {
        const products = await getProducts();
        const product = products.find(p => p.id === id);
        if (!product) return showToast('Product not found');
        
        editingId = id;
        document.getElementById('inputDhgateLink').value = product.dhgateLink || '';
        document.getElementById('inputThumbnailUrl').value = product.thumbnailUrl || '';
        document.getElementById('inputTitle').value = product.title || '';
        document.getElementById('inputPrice').value = product.price || '';
        document.getElementById('inputAffiliateLink').value = product.affiliateLink || '';
        document.getElementById('inputCategory').value = product.category || 'shirts';
        document.getElementById('inputBrand').value = product.brand || '';
        document.getElementById('inputRating').value = product.rating || 4.5;
        document.getElementById('inputThumbnailFile').value = '';
        
        const reviewContainer = document.getElementById('reviewPreviews');
        if (reviewContainer) {
            if (product.reviewImages && product.reviewImages.length > 0) {
                reviewContainer.innerHTML = product.reviewImages.map(img => `<img src="${img}" alt="review" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid var(--glass-border);">`).join('');
                reviewContainer.innerHTML += `<div style="font-size:0.7rem;color:var(--text-muted);width:100%;margin-top:4px;">${product.reviewImages.length} existing image(s). Upload new ones to replace.</div>`;
            } else reviewContainer.innerHTML = '';
        }
        
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
        submitBtn.innerHTML = '<i class="bi bi-pencil-square"></i> Update Product';
        window.scrollTo({ top: document.getElementById('addProductForm').offsetTop - 100, behavior: 'smooth' });
    };

    init();
});