export default function ProductListRow({
  product,
  currentStore,
  submitting,
  onPayNow,
  onAddProduct,
  currency,
}) {
  return (
    <div className="product-list-row">
      <div className="product-list-row__info">
        <strong>{product.product_name}</strong>
        {product.description ? (
          <p className="product-list-row__description">{product.description}</p>
        ) : null}
      </div>

      <div className="product-list-row__price">
        {currency(product.price, currentStore?.currency)}
      </div>

      <div className="product-list-row__actions">
        <button
          type="button"
          className="ghost-button"
          onClick={() => onAddProduct(product)}
          disabled={submitting}
        >
          Add
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => onPayNow(product)}
          disabled={submitting}
        >
          Pay Now
        </button>
      </div>
    </div>
  );
}