document.addEventListener('DOMContentLoaded', function() {
    const STORAGE_PRODUCTS = 'dhgatevault_products';
    const STORAGE_ANALYTICS = 'dhgatevault_analytics';
    const STORAGE_VIEWS = 'dhgatevault_pageviews';
    const STORAGE_VAULT_CREDS = 'dhgatevault_vault_creds';
    const STORAGE_EVENTS = 'dhgatevault_events';

    const ADMIN_USERNAME = 'EncryptedID';
    const ADMIN_PASS_HASH = '790ca82fe39898705aa8d1a53fda65a0480b649f6d841f4d0ebaa711e979c9ea';

    const $toast = document.getElementById('toastContainer');
    let isUnlocked = false;
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

    function setLocked(locked) {
        isUnlocked = !locked;
        const inputs = document.querySelectorAll('#addProductForm input, #addProductForm select, #addProductForm textarea, #addProductForm button[type="submit"], #btnSaveVaultCreds, #btnResetAnalytics, .btn--danger');
        inputs.forEach(el => el.disabled = locked);
        const overlay = document.getElementById('adminLockOverlay');
        if (overlay) overlay.style.display = locked ? 'flex' : 'none';
        if (!locked) loadData();
    }

    async function attemptUnlock() {
        const userInput = document.getElementById('adminUnlockUsername');
        const passInput = document.getElementById('adminUnlockPassword');
        const errorMsg = document.getElementById('unlockError');

        if (!userInput || !passInput) {
            console.error('Missing username or password input');
            return;
        }

        const user = userInput.value.trim();
        const pw = passInput.value;
        if (!user || !pw) return;

        if (user !== ADMIN_USERNAME) {
            if (errorMsg) errorMsg.style.display = 'block';
            return;
        }

        const hash = await hashPassword(pw);
        if (hash === ADMIN_PASS_HASH) {
            setLocked(false);
            if (errorMsg) errorMsg.style.display = 'none';
            userInput.value = '';
            passInput.value = '';
        } else {
            if (errorMsg) errorMsg.style.display = 'block';
        }
    }

    function init() {
        const btnLogout = document.getElementById('btnLogout');
        const btnUnlock = document.getElementById('btnUnlockAdmin');
        const usernameInput = document.getElementById('adminUnlockUsername');
        const passwordInput = document.getElementById('adminUnlockPassword');
        const addForm = document.getElementById('addProductForm');
        const btnSaveVault = document.getElementById('btnSaveVaultCreds');
        const btnResetAnalytics = document.getElementById('btnResetAnalytics');
        const inputDhgateLink = document.getElementById('inputDhgateLink');
        const inputReviewPhotos = document.getElementById('inputReviewPhotos');

        if (btnLogout) btnLogout.addEventListener('click', () => window.location.href = 'index.html');
        if (btnUnlock) btnUnlock.addEventListener('click', attemptUnlock);
        if (usernameInput) usernameInput.addEventListener('keypress', e => { if (e.key === 'Enter') passwordInput?.focus(); });
        if (passwordInput) passwordInput.addEventListener('keypress', e => { if (e.key === 'Enter') attemptUnlock(); });

        loadData();

        if (addForm) addForm.addEventListener('submit', handleAddProduct);
        if (btnSaveVault) btnSaveVault.addEventListener('click', saveVaultCreds);
        if (btnResetAnalytics) btnResetAnalytics.addEventListener('click', resetAnalytics);
        if (inputDhgateLink) inputDhgateLink.addEventListener('blur', autoFillPrice);
        if (inputReviewPhotos) inputReviewPhotos.addEventListener('change', previewImages);

        document.querySelectorAll('.collapsible__trigger').forEach(btn => {
            btn.addEventListener('click', () => {
                const card = btn.closest('.collapsible');
                card.classList.toggle('collapsible--open');
                const arrow = btn.querySelector('.collapsible__arrow');
                if (arrow) arrow.classList.toggle('bi-chevron-down');
            });
        });

        setLocked(true);
    }

    // ---------- SERVER-SYNCED PRODUCTS ----------
    async function getProducts() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/products');
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

    // ---------- ANALYTICS ----------
    async function getEvents() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch('/api/events');
                if (res.ok) return await res.json();
            } catch (e) {
                console.warn('Server events fetch failed');
            }
        }
        return [];
    }

    function calculateMetrics(events) {
        const clickMap = {};
        const viewMap = {};
        events.forEach(ev => {
            if (ev.type === 'click') clickMap[ev.productId] = (clickMap[ev.productId] || 0) + 1;
            else if (ev.type === 'image_view') viewMap[ev.productId] = (viewMap[ev.productId] || 0) + 1;
        });
        return { clickMap, viewMap };
    }

    // ---------- POPULATE BRAND FILTER ----------
    function populateBrandFilter(products) {
        const select = document.getElementById('brandFilter');
        if (!select) return;

        select.innerHTML = '<option value="all">All Brands</option>';

        const brands = [...new Set(products.map(p => p.brand).filter(Boolean))];
        brands.sort();

        brands.forEach(brand => {
            const opt = document.createElement('option');
            opt.value = brand;
            opt.textContent = brand;
            select.appendChild(opt);
        });
        
        console.log(`✅ Brand filter populated with ${brands.length} brands.`);
    }

    async function loadData() {
        const products = await getProducts();
        const events = await getEvents();
        const { clickMap, viewMap } = calculateMetrics(events);

        document.getElementById('adminTotalProducts').textContent = products.length;
        document.getElementById('adminTotalClicks').textContent = Object.values(clickMap).reduce((s, c) => s + c, 0);
        document.getElementById('adminTotalViews').textContent = Object.values(viewMap).reduce((s, c) => s + c, 0);

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
            brandFilter.onchange = function() {
                renderTable(products, clickMap);
            };
        }

        renderTable(products, clickMap);

        const creds = JSON.parse(localStorage.getItem(STORAGE_VAULT_CREDS) || '{}');
        if (creds.username) document.getElementById('vaultUsernameInput').value = creds.username;
    }

    function renderBarChart(products, clickMap) {
        const chart = document.getElementById('barChart');
        if (!chart) return;
        chart.innerHTML = '';
        const tooltip = document.getElementById('chartTooltip');
        const max = Math.max(1, ...products.map(p => clickMap[p.id] || 0));
        products.slice(0, 12).forEach(p => {
            const clicks = clickMap[p.id] || 0;
            const bar = document.createElement('div');
            bar.className = 'bar-chart__bar';
            const calculatedHeight = Math.max(8, (clicks / max) * 110);
            bar.style.height = calculatedHeight + 'px';
            bar.setAttribute('data-clicks', clicks);
            bar.setAttribute('data-title', p.title);
            bar.addEventListener('mouseenter', () => {
                if (tooltip) {
                    tooltip.textContent = `${p.title}: ${clicks} clicks`;
                    tooltip.style.display = 'block';
                    const rect = bar.getBoundingClientRect();
                    tooltip.style.left = rect.left + rect.width / 2 + 'px';
                    tooltip.style.top = rect.top - 30 + 'px';
                }
            });
            bar.addEventListener('mouseleave', () => { if (tooltip) tooltip.style.display = 'none'; });
            const label = document.createElement('div');
            label.className = 'bar-chart__label';
            label.textContent = p.title.substr(0, 8);
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;';
            wrap.appendChild(bar);
            wrap.appendChild(label);
            chart.appendChild(wrap);
        });
    }

    // ---------- TABLE RENDER WITH BRAND FILTER ----------
    function renderTable(products, clickMap) {
        const tbody = document.getElementById('adminTableBody');
        if (!tbody) return;

        const brandFilter = document.getElementById('brandFilter');
        const selectedBrand = brandFilter?.value || 'all';

        let filtered = products;
        if (selectedBrand !== 'all') {
            filtered = products.filter(p => p.brand === selectedBrand);
        }

        const sorted = [...filtered].sort((a, b) => (clickMap[b.id] || 0) - (clickMap[a.id] || 0));

        tbody.innerHTML = '';
        sorted.forEach(p => {
            const clicks = clickMap[p.id] || 0;
            const priority = clicks >= 10 ? '🔥 High' : clicks >= 4 ? '⭐ Medium' : 'Low';
            const disabledAttr = isUnlocked ? '' : 'disabled';

            tbody.innerHTML += `<tr>
                <td>${p.title.substr(0, 30)}</td>
                <td>${p.category}</td>
                <td>${p.brand || '—'}</td>
                <td>${clicks}</td>
                <td>${priority}</td>
                <td>
                    <button class="btn btn--ghost btn--sm" onclick="editProduct('${p.id}')" ${disabledAttr} title="Edit"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn--ghost btn--sm btn--danger" onclick="deleteProduct('${p.id}')" ${disabledAttr} title="Delete"><i class="bi bi-trash"></i></button>
                </td>
            </tr>`;
        });
    }

    async function handleAddProduct(e) {
        e.preventDefault();
        if (!isUnlocked) return;
        const files = document.getElementById('inputReviewPhotos')?.files || [];
        const reviewImages = [];
        for (let f of files) {
            const b64 = await new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(f); });
            reviewImages.push(b64);
        }
        const productData = {
            dhgateLink: document.getElementById('inputDhgateLink').value,
            thumbnailUrl: document.getElementById('inputThumbnailUrl').value,
            title: document.getElementById('inputTitle').value,
            price: document.getElementById('inputPrice').value,
            affiliateLink: document.getElementById('inputAffiliateLink').value,
            category: document.getElementById('inputCategory').value,
            brand: document.getElementById('inputBrand').value,
            rating: document.getElementById('inputRating').value,
            reviewImages: reviewImages.length ? reviewImages : undefined,
            createdAt: new Date().toISOString()
        };

        const product = { id: editingId || 'prod_' + Date.now(), ...productData };

        await upsertProductToServer(product);

        const localProduct = { ...product };
        delete localProduct.reviewImages;

        try {
            let products = JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
            const idx = products.findIndex(p => p.id === localProduct.id);
            if (idx >= 0) products[idx] = localProduct;
            else products.unshift(localProduct);
            localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));
        } catch (err) {
            console.warn('Local product cache skipped (quota?)');
        }

        if (editingId) {
            showToast('✅ Product updated!');
            editingId = null;
            document.querySelector('#addProductForm button[type="submit"]').innerHTML = '<i class="bi bi-cloud-upload"></i> Add Product';
        } else {
            showToast('✅ Product added!');
        }

        await loadData();
        e.target.reset();
        document.getElementById('reviewPreviews').innerHTML = '';
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
        if (!isUnlocked) return;
        const u = document.getElementById('vaultUsernameInput')?.value.trim();
        const p = document.getElementById('vaultPasswordInput')?.value;
        if (!u || !p) return showToast('Enter both.');
        hashPassword(p).then(hash => {
            localStorage.setItem(STORAGE_VAULT_CREDS, JSON.stringify({ username: u, passwordHash: hash }));
            showToast('Vault credentials saved.');
        });
    }

    function resetAnalytics() {
        if (!isUnlocked) return;
        if (confirm('Reset all analytics?')) {
            localStorage.removeItem(STORAGE_ANALYTICS);
            localStorage.removeItem(STORAGE_EVENTS);
            loadData();
            showToast('Analytics reset.');
        }
    }

    window.deleteProduct = async function(id) {
        if (!isUnlocked) return showToast('🔒 Unlock admin first');
        if (!confirm('Delete this product?')) return;

        await deleteProductFromServer(id);

        let products = JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]');
        products = products.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));

        await loadData();
        showToast('🗑️ Product deleted');
    };

    window.editProduct = async function(id) {
        if (!isUnlocked) return showToast('🔒 Unlock admin first');
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
        document.getElementById('reviewPreviews').innerHTML = (product.reviewImages || []).map(img => `<img src="${img}" alt="review">`).join('');
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
        submitBtn.innerHTML = '<i class="bi bi-pencil-square"></i> Update Product';
        const collapsible = document.querySelector('.collapsible');
        if (collapsible && !collapsible.classList.contains('collapsible--open')) {
            collapsible.querySelector('.collapsible__trigger').click();
        }
        window.scrollTo({ top: document.getElementById('addProductForm').offsetTop - 100, behavior: 'smooth' });
    };

    init();
});