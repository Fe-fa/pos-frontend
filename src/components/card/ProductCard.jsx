export default function ProductCard({
  product,
  currentStore,
  submitting,
  onPayNow,
  onAddProduct,
  currency,
  getProductImage,
}) {
  const image = getProductImage(product);

  return (
    <article className="product-card">
      <div
        className="product-card-overlay"
        style={{
          backgroundImage: image
            ? `url(${image})`
            : `linear-gradient(135deg, #427E97 0%, #E17A38 100%)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {product.description ? (
          <div className="product-card-description-hover">
            {product.description}
          </div>
        ) : null}

        <div className="product-card-actions">
          <button
            type="button"
            className="primary-button pay-now-btn"
            disabled={submitting}
            onClick={() => onPayNow(product)}
          >
            Pay Now
          </button>

          <button
            type="button"
            className="ghost-button add-btn"
            onClick={() => onAddProduct(product)}
          >
            Add
          </button>
        </div>
      </div>

      <div className="product-card-info">
        <h3>{product.product_name}</h3>
        <strong>{currency(product.price, currentStore?.currency)}</strong>
      </div>
    </article>
  );
}