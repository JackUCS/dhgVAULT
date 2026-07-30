(function() {
    const STORAGE_PRODUCTS = 'dhgatevault_products';
    const STORAGE_ANALYTICS = 'dhgatevault_analytics';
    const STORAGE_VIEWS = 'dhgatevault_pageviews';

    const $productsGrid = document.getElementById('productsGrid');
    const $emptyState = document.getElementById('emptyState');
    const $filtersContainer = document.getElementById('filtersContainer');
    const $toastContainer = document.getElementById('toastContainer');
    const $lightboxOverlay = document.getElementById('lightboxOverlay');
    const $lightboxImage = document.getElementById('lightboxImage');
    let currentFilter = 'all';

    // Data
    function getProducts() { try { return JSON.parse(localStorage.getItem(STORAGE_PRODUCTS)) || []; } catch(e){ return []; } }
    function getAnalytics() { try { return JSON.parse(localStorage.getItem(STORAGE_ANALYTICS)) || {}; } catch(e){ return {}; } }
    function incrementPageViews() { const v = (parseInt(localStorage.getItem(STORAGE_VIEWS))||0)+1; localStorage.setItem(STORAGE_VIEWS, v); }
    function recordClick(productId) { const a = getAnalytics(); if(!a[productId]) a[productId]={clicks:0,lastClicked:null}; a[productId].clicks++; a[productId].lastClicked=new Date().toISOString(); localStorage.setItem(STORAGE_ANALYTICS, JSON.stringify(a)); }

    // Lightbox
    function openLightbox(src) { $lightboxImage.src=src; $lightboxOverlay.classList.add('modal-overlay--active'); }
    function closeLightbox() { $lightboxOverlay.classList.remove('modal-overlay--active'); }
    document.getElementById('btnLightboxClose').addEventListener('click', closeLightbox);
    $lightboxOverlay.addEventListener('click', e => { if(e.target===$lightboxOverlay) closeLightbox(); });

    function renderProducts(filter='all') {
        const products = getProducts();
        const filtered = filter==='all'?products:products.filter(p=>p.category===filter);
        $productsGrid.innerHTML='';
        if(filtered.length===0){ $productsGrid.style.display='none'; $emptyState.style.display='block'; }
        else { $productsGrid.style.display=''; $emptyState.style.display='none'; }
        filtered.forEach(p=>$productsGrid.appendChild(createCard(p)));
    }

    function createCard(p) {
        const card = document.createElement('div'); card.className='product-card';
        const imgs = (p.reviewImages||[]).map(img=>`<img class="product-card__review-thumb" src="${escapeHTML(img)}" onclick="event.stopPropagation();document.querySelector('#lightboxImage').src='${escapeHTML(img)}';document.getElementById('lightboxOverlay').classList.add('modal-overlay--active');" onerror="this.style.display='none'">`).join('');
        card.innerHTML = `
            <div class="product-card__image-wrap">
                <img class="product-card__main-img" src="${escapeHTML(p.thumbnailUrl)}" alt="${escapeHTML(p.title)}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22><rect fill=%22%231a1a2e%22 width=%22300%22 height=%22300%22/><text fill=%22%23666%22 x=%2250%25%22 y=%2250%25%22 dy=%22.3em%22>Image</text></svg>'">
                <div class="product-card__dhgate-badge"><i class="bi bi-diamond-fill"></i> DHGate</div>
                ${(p.reviewImages||[]).length>0 ? `<div style="position:absolute;top:12px;right:12px;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);padding:3px 10px;border-radius:5px;font-size:0.65rem;color:#fff;"><i class="bi bi-camera-fill"></i> ${p.reviewImages.length}</div>`:''}
                <div class="product-card__review-overlay">
                    ${imgs||'<span style="color:rgba(255,255,255,0.4);font-size:0.7rem;padding:8px;">No review photos yet</span>'}
                </div>
            </div>
            <div class="product-card__body">
                <div class="product-card__title">${escapeHTML(p.title)}</div>
                <div class="product-card__meta">
                    <span class="product-card__price">$${parseFloat(p.price).toFixed(2)}</span>
                    <span style="color:var(--warning);"><i class="bi bi-star-fill"></i> ${p.rating||4.5}</span>
                </div>
                <div class="product-card__actions">
                    <a href="${escapeHTML(p.affiliateLink)}" class="product-card__affiliate-btn" target="_blank" rel="sponsored" onclick="window._dhgv_click('${p.id}')"><i class="bi bi-cart-fill"></i> Shop Now</a>
                    <button class="product-card__copy-btn" onclick="navigator.clipboard.writeText('${escapeHTML(p.affiliateLink)}').then(()=>alert('Link copied'))"><i class="bi bi-clipboard"></i></button>
                </div>
            </div>`;
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left, y = e.clientY - rect.top;
            const rx = ((y - rect.height/2)/rect.height)*7;
            const ry = ((x - rect.width/2)/rect.width)*7;
            card.style.transform = `perspective(1000px) rotateX(${-rx}deg) rotateY(${ry}deg) translateY(-5px)`;
        });
        card.addEventListener('mouseleave', () => card.style.transform='');
        return card;
    }

    function escapeHTML(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }

    window._dhgv_click = function(id) { recordClick(id); };

    // Filters
    $filtersContainer.addEventListener('click', e => {
        if(e.target.classList.contains('filter-pill')){
            document.querySelectorAll('.filter-pill').forEach(p=>p.classList.remove('filter-pill--active'));
            e.target.classList.add('filter-pill--active');
            currentFilter = e.target.dataset.category;
            renderProducts(currentFilter);
        }
    });

    // Init
    if(getProducts().length===0){
        const demos = [
            {id:'d1',dhgateLink:'#',thumbnailUrl:'https://picsum.photos/seed/shirt1/600/600',title:'Oversized Graphic Tee – Vintage Wash',price:24.50,affiliateLink:'#',category:'shirts',rating:4.7,reviewImages:['https://picsum.photos/seed/shirt1a/300/300','https://picsum.photos/seed/shirt1b/300/300']},
            {id:'d2',dhgateLink:'#',thumbnailUrl:'https://picsum.photos/seed/jeans2/600/600',title:'Slim Fit Distressed Jeans',price:36.00,affiliateLink:'#',category:'jeans',rating:4.4,reviewImages:['https://picsum.photos/seed/jeans2a/300/300']},
            {id:'d3',dhgateLink:'#',thumbnailUrl:'https://picsum.photos/seed/jogger3/600/600',title:'Tech Fleece Joggers',price:29.99,affiliateLink:'#',category:'joggers',rating:4.6,reviewImages:[]},
            {id:'d4',dhgateLink:'#',thumbnailUrl:'https://picsum.photos/seed/shoes4/600/600',title:'Chunky Dad Sneakers',price:45.00,affiliateLink:'#',category:'shoes',rating:4.8,reviewImages:['https://picsum.photos/seed/shoes4a/300/300']},
            {id:'d5',dhgateLink:'#',thumbnailUrl:'https://picsum.photos/seed/slides5/600/600',title:'Logo Slides',price:18.00,affiliateLink:'#',category:'slides',rating:4.2,reviewImages:[]},
            {id:'d6',dhgateLink:'#',thumbnailUrl:'https://picsum.photos/seed/chain6/600/600',title:'Cuban Link Chain',price:22.50,affiliateLink:'#',category:'chains',rating:4.9,reviewImages:['https://picsum.photos/seed/chain6a/300/300']}
        ];
        localStorage.setItem(STORAGE_PRODUCTS, JSON.stringify(demos));
        localStorage.setItem(STORAGE_VIEWS, '1');
    }
    incrementPageViews();
    renderProducts();
})();

// Cookie consent
const cookieBanner = document.getElementById('cookieConsent');
if(cookieBanner){
    if(localStorage.getItem('cookie_consent')) cookieBanner.style.display='none';
    document.getElementById('cookieAccept').addEventListener('click', ()=>{
        cookieBanner.style.display='none';
        localStorage.setItem('cookie_consent','true');
    });
}