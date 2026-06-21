const PSHShop = (function () {
  function card(p) {
    const discount = p.compare_at_price && p.compare_at_price > p.retail_price ? Math.round(100 * (p.compare_at_price - p.retail_price) / p.compare_at_price) : 0;
    return `<div class="product-card">
      <a href="/product/${p.slug}" style="display:contents">
        <div class="thumb">
          ${discount ? `<span class="badge-discount">-${discount}%</span>` : ''}
          <img loading="lazy" src="${p.image_url || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'}" alt="${PSH.escapeHtml(p.title)}" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400'">
        </div>
        <div class="body">
          <div class="store">${PSH.escapeHtml(p.store_name || '')} ${p.is_verified ? '<span class="badge badge-verified">✓</span>' : ''}</div>
          <div class="title">${PSH.escapeHtml(p.title)}</div>
          <div class="price-row"><span class="price">${PSH.money(p.retail_price)}</span>${p.compare_at_price ? `<span class="price-compare">${PSH.money(p.compare_at_price)}</span>` : ''}</div>
          <div class="rating"><span class="stars">★</span> ${(p.rating_avg || 0).toFixed(1)} (${p.rating_count || 0})</div>
        </div>
      </a>
    </div>`;
  }

  async function addToCart(productId, quantity = 1, variantId = null) {
    try {
      await PSH.api('/cart', { method: 'POST', body: { productId, quantity, variantId } });
      PSH.toast('Added to cart.', 'success');
      PSH.refreshCartCount();
    } catch (e) {
      if (e.status === 401) { window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname); return; }
      PSH.toast(e.message, 'error');
    }
  }

  async function toggleWishlist(productId, btn) {
    try {
      if (btn.classList.contains('active')) {
        await PSH.api('/wishlist/' + productId, { method: 'DELETE' });
        btn.classList.remove('active');
      } else {
        await PSH.api('/wishlist', { method: 'POST', body: { productId } });
        btn.classList.add('active');
      }
    } catch (e) {
      if (e.status === 401) { window.location.href = '/login'; return; }
      PSH.toast(e.message, 'error');
    }
  }

  return { card, addToCart, toggleWishlist };
})();
