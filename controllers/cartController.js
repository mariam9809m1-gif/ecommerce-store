const asyncHandler = require('express-async-handler');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Get cart
// @route   GET /api/cart
// @access  Private
exports.getCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id }).populate(
    'items.product',
    'name images stock price'
  );

  if (!cart) {
    return res.json({ success: true, cart: { items: [], total: 0 } });
  }

  res.json({ success: true, cart });
});

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
exports.addToCart = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  if (product.stock < quantity) {
    res.status(400);
    throw new Error(`Only ${product.stock} items in stock`);
  }

  let cart = await Cart.findOne({ user: req.user.id });

  if (!cart) {
    cart = new Cart({ user: req.user.id, items: [] });
  }

  const itemIndex = cart.items.findIndex(
    (item) => item.product.toString() === productId
  );

  if (itemIndex > -1) {
    // Update quantity
    const newQty = cart.items[itemIndex].quantity + quantity;
    if (newQty > product.stock) {
      res.status(400);
      throw new Error(`Only ${product.stock} items available`);
    }
    cart.items[itemIndex].quantity = newQty;
  } else {
    // Add new item
    cart.items.push({
      product:  product._id,
      name:     product.name,
      image:    product.images[0]?.url || '',
      price:    product.discountPrice > 0 ? product.discountPrice : product.price,
      quantity,
    });
  }

  await cart.save();
  await cart.populate('items.product', 'name images stock price');
  res.json({ success: true, cart });
});

// @desc    Update cart item quantity
// @route   PUT /api/cart/:itemId
// @access  Private
exports.updateCartItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cart = await Cart.findOne({ user: req.user.id });

  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  const item = cart.items.id(req.params.itemId);
  if (!item) {
    res.status(404);
    throw new Error('Item not found in cart');
  }

  const product = await Product.findById(item.product);
  if (quantity > product.stock) {
    res.status(400);
    throw new Error(`Only ${product.stock} items available`);
  }

  item.quantity = quantity;
  await cart.save();
  await cart.populate('items.product', 'name images stock price');
  res.json({ success: true, cart });
});

// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
exports.removeFromCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) {
    res.status(404);
    throw new Error('Cart not found');
  }

  cart.items = cart.items.filter(
    (item) => item._id.toString() !== req.params.itemId
  );

  await cart.save();
  res.json({ success: true, cart });
});

// @desc    Clear cart
// @route   DELETE /api/cart
// @access  Private
exports.clearCart = asyncHandler(async (req, res) => {
  await Cart.findOneAndDelete({ user: req.user.id });
  res.json({ success: true, message: 'Cart cleared' });
});
