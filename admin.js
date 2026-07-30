(function() {
    const STORAGE_PRODUCTS = 'dhgatevault_products';
    const STORAGE_ANALYTICS = 'dhgatevault_analytics';
    const STORAGE_VIEWS = 'dhgatevault_pageviews';
    const STORAGE_VAULT_CREDS = 'dhgatevault_vault_creds';
    const ADMIN_PASS_HASH = 'bc98688806fc3aabdbcc24666fb9563c1b6b3d7c324903e8e5f2601b228fcd49'; // your hash

    const $toast = document.getElementById('toastContainer');
    let isUnlocked = false;
    let editingId = null;          // track which product is being edited

    function showToast(msg) {
        const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
        $toast.appendChild(t); setTimeout(() => t.remove(), 3000);
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
        document.getElementById('adminLockOverlay').style.display = locked ? 'flex' : 'none';
        if (!locked) loadData();  // re-render table to enable/disable buttons
    }

    async function attemptUnlock() {
        const pw = document.getElementById('adminUnlockPassword').value;
        if (!pw) return;
        const hash = await hashPassword(pw);
        if (hash === ADMIN_PASS_HASH) {
            setLocked(false);
            document.getElementById('unlockError').style.display = 'none';
            document.getElementById('adminUnlockPassword').value = '';
        } else {
            document.getElementById('unlockError').style.display = 'block';
        }
    }

    // DELETE PRODUCT
    window.deleteProduct = function(id) {
        if (!isUnlocked) return showToast('🔒 Unlock admin first');
        if (!confirm('Delete this product?')) return;
        const products = getProducts().filter(p => p.id !== id);
        localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));
        const analytics = getAnalytics(); delete analytics[id];
        localStorage.setItem(STORAGE_ANALYTICS, JSON.stringify(analytics));
        loadData();
        showToast('🗑️ Product deleted');
    };

    // EDIT PRODUCT – populate form
    window.editProduct = function(id) {
        if (!isUnlocked) return showToast('🔒 Unlock admin first');
        const product = getProducts().find(p => p.id === id);
        if (!product) return;
        editingId = id;
        document.getElementById('inputDhgateLink').value = product.dhgateLink || '';
        document.getElementById('inputThumbnailUrl').value = product.thumbnailUrl || '';
        document.getElementById('inputTitle').value = product.title || '';
        document.getElementById('inputPrice').value = product.price || '';
        document.getElementById('inputAffiliateLink').value = product.affiliateLink || '';
        document.getElementById('inputCategory').value = product.category || 'shirts';
        document.getElementById('inputRating').value = product.rating || 4.5;
        document.getElementById('reviewPreviews').innerHTML = (product.reviewImages || []).map(img => `<img src="${img}" alt="review">`).join('');
        // Change button text
        const submitBtn = document.querySelector('#addProductForm button[type="submit"]');
        submitBtn.innerHTML = '<i class="bi bi-pencil-square"></i> Update Product';
        // Open the collapsible if closed
        const collapsible = document.querySelector('.collapsible');
        if (collapsible && !collapsible.classList.contains('collapsible--open')) {
            collapsible.querySelector('.collapsible__trigger').click();
        }
        window.scrollTo({ top: document.getElementById('addProductForm').offsetTop - 100, behavior: 'smooth' });
    };

    function init() {
        document.getElementById('btnLogout').addEventListener('click', () => window.location.href = 'index.html');
        document.getElementById('btnUnlockAdmin').addEventListener('click', attemptUnlock);
        document.getElementById('adminUnlockPassword').addEventListener('keypress', e => { if (e.key === 'Enter') attemptUnlock(); });

        loadData();
        document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
        document.getElementById('btnSaveVaultCreds').addEventListener('click', saveVaultCreds);
        document.getElementById('btnResetAnalytics').addEventListener('click', resetAnalytics);
        document.getElementById('inputDhgateLink').addEventListener('blur', autoFillPrice);
        document.getElementById('inputReviewPhotos').addEventListener('change', previewImages);

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

    function getProducts() { return JSON.parse(localStorage.getItem(STORAGE_PRODUCTS) || '[]'); }
    function getAnalytics() { return JSON.parse(localStorage.getItem(STORAGE_ANALYTICS) || '{}'); }
    function getViews() { return parseInt(localStorage.getItem(STORAGE_VIEWS)) || 0; }

    function loadData() {
        const products = getProducts();
        const analytics = getAnalytics();
        document.getElementById('adminTotalProducts').textContent = products.length;
        document.getElementById('adminTotalClicks').textContent = Object.values(analytics).reduce((s, a) => s + (a.clicks || 0), 0);
        document.getElementById('adminTotalViews').textContent = getViews();
        let top = '—', topC = 0;
        products.forEach(p => { const c = (analytics[p.id]?.clicks || 0); if (c > topC) { topC = c; top = p.title.substr(0, 25); } });
        document.getElementById('adminTopProduct').textContent = top;
        renderBarChart(products, analytics);
        renderTable(products, analytics);
        const creds = JSON.parse(localStorage.getItem(STORAGE_VAULT_CREDS) || '{}');
        if (creds.username) document.getElementById('vaultUsernameInput').value = creds.username;
    }

    function renderBarChart(products, analytics) {
        const chart = document.getElementById('barChart');
        chart.innerHTML = '';
        const tooltip = document.getElementById('chartTooltip');
        const max = Math.max(1, ...products.map(p => analytics[p.id]?.clicks || 0));
        products.slice(0, 12).forEach(p => {
            const clicks = analytics[p.id]?.clicks || 0;
            const bar = document.createElement('div');
            bar.className = 'bar-chart__bar';
            // Minimum height of 8px, maximum 110px
            const calculatedHeight = Math.max(8, (clicks / max) * 110);
            bar.style.height = calculatedHeight + 'px';
            bar.setAttribute('data-clicks', clicks);
            bar.setAttribute('data-title', p.title);
            bar.addEventListener('mouseenter', () => {
                tooltip.textContent = `${p.title}: ${clicks} clicks`;
                tooltip.style.display = 'block';
                const rect = bar.getBoundingClientRect();
                tooltip.style.left = rect.left + rect.width / 2 + 'px';
                tooltip.style.top = rect.top - 30 + 'px';
            });
            bar.addEventListener('mouseleave', () => tooltip.style.display = 'none');
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

    function renderTable(products, analytics) {
        const tbody = document.getElementById('adminTableBody'); tbody.innerHTML = '';
        const sorted = [...products].sort((a, b) => (analytics[b.id]?.clicks || 0) - (analytics[a.id]?.clicks || 0));
        sorted.forEach(p => {
            const clicks = analytics[p.id]?.clicks || 0,
                last = analytics[p.id]?.lastClicked ? new Date(analytics[p.id].lastClicked).toLocaleDateString() : 'Never';
            const priority = clicks >= 10 ? '🔥 High' : clicks >= 4 ? '⭐ Medium' : 'Low';
            const disabledAttr = isUnlocked ? '' : 'disabled';
            tbody.innerHTML += `<tr>
                <td>${p.title.substr(0, 30)}</td>
                <td>${p.category}</td>
                <td>${clicks}</td>
                <td>${last}</td>
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
        const files = document.getElementById('inputReviewPhotos').files;
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
            rating: document.getElementById('inputRating').value,
            reviewImages: reviewImages.length ? reviewImages : undefined,
            createdAt: new Date().toISOString()
        };

        const products = getProducts();
        if (editingId) {
            const index = products.findIndex(p => p.id === editingId);
            if (index !== -1) {
                const oldImages = products[index].reviewImages || [];
                products[index] = { ...products[index], ...productData, reviewImages: productData.reviewImages || oldImages, id: editingId };
                showToast('✅ Product updated!');
            }
            editingId = null;
            document.querySelector('#addProductForm button[type="submit"]').innerHTML = '<i class="bi bi-cloud-upload"></i> Add Product';
        } else {
            const newProduct = { id: 'prod_' + Date.now(), ...productData };
            products.unshift(newProduct);
            showToast('✅ Product added!');
        }
        localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(products));
        loadData();
        e.target.reset();
        document.getElementById('reviewPreviews').innerHTML = '';
    }

    function autoFillPrice() {
        const link = document.getElementById('inputDhgateLink').value;
        const priceInput = document.getElementById('inputPrice');
        if (!link || priceInput.value) return;
        let h = 0; for (let i = 0; i < link.length; i++) h = ((h << 5) - h) + link.charCodeAt(i);
        priceInput.value = ((Math.abs(h) % 10500) / 100 + 15).toFixed(2);
    }

    function previewImages() {
        const container = document.getElementById('reviewPreviews'); container.innerHTML = '';
        for (let f of this.files) {
            const r = new FileReader();
            r.onload = e => { const img = document.createElement('img'); img.src = e.target.result; container.appendChild(img); };
            r.readAsDataURL(f);
        }
    }

    function saveVaultCreds() {
        if (!isUnlocked) return;
        const u = document.getElementById('vaultUsernameInput').value.trim();
        const p = document.getElementById('vaultPasswordInput').value;
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
            loadData();
            showToast('Analytics reset.');
        }
    }

    init();
})();