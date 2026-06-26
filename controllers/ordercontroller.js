const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Create order
// @route   POST /api/orders
// @access  Private
exports.createOrder = asyncHandler(async (req, res) => {
  const { shippingAddress, paymentMethod, notes } = req.body;

  // Get user cart
  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error('No items in cart');
  }

  // Verify stock
  for (const item of cart.items) {
    const product = await Product.findById(item.product);
    if (!product) {
      res.status(404);
      throw new Error(`Product not found: ${item.name}`);
    }
    if (product.stock < item.quantity) {
      res.status(400);
      throw new Error(`Insufficient stock for: ${item.name}`);
    }
  }

  const itemsPrice    = cart.total;
  const taxPrice      = Math.round(itemsPrice * 0.1 * 100) / 100;
  const shippingPrice = itemsPrice > 100 ? 0 : 10;
  const totalPrice    = itemsPrice + taxPrice + shippingPrice;

  const order = await Order.create({
    user: req.user.id,
    orderItems: cart.items.map((item) => ({
      product:  item.product,
      name:     item.name,
      image:    item.image,
      price:    item.price,
      quantity: item.quantity,
    })),
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
    notes,
  });

  // Decrease stock
  for (const item of cart.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity },
    });
  }

  // Clear cart
  await Cart.findOneAndDelete({ user: req.user.id });

  res.status(201).json({ success: true, order });
});

// @desc    Get user orders
// @route   GET /api/orders
// @access  Private
exports.getMyOrders = asyncHandler(async (req, res) => {
  const page   = parseInt(req.query.page) || 1;
  const limit  = parseInt(req.query.limit) || 10;
  const skip   = (page - 1) * limit;

  const total  = await Order.countDocuments({ user: req.user.id });
  const orders = await Order.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  res.json({ success: true, orders, total, page, pages: Math.ceil(total / limit) });
});

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    'user',
    'name email'
  );

  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  // Only owner or admin can view
  if (
    order.user._id.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized');
  }

  res.json({ success: true, order });
});

// @desc    Update order to paid
// @route   PUT /api/orders/:id/pay
// @access  Private
exports.updateOrderToPaid = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.isPaid          = true;
  order.paidAt          = Date.now();
  order.orderStatus     = 'processing';
  order.paymentResult   = {
    id:           req.body.id,
    status:       req.body.status,
    update_time:  req.body.update_time,
    email_address: req.body.email_address,
  };

  const updated = await order.save();
  res.json({ success: true, order: updated });
});

// @desc    Cancel order
// @route   PUT /api/orders/:id/cancel
// @access  Private
exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Not authorized');
  }

  if (['shipped', 'delivered'].includes(order.orderStatus)) {
    res.status(400);
    throw new Error('Cannot cancel a shipped or delivered order');
  }

  // Restore stock
  for (const item of order.orderItems) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });
  }

  order.orderStatus = 'cancelled';
  await order.save();

  res.json({ success: true, order });
});

// ── Admin ────────────────────────────────────────────────────────────

// @desc    Get all orders
// @route   GET /api/orders/admin/all
// @access  Private/Admin
exports.getAllOrders = asyncHandler(async (req, res) => {
  const page   = parseInt(req.query.page) || 1;
  const limit  = parseInt(req.query.limit) || 20;
  const skip   = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.orderStatus = req.query.status;

  const total  = await Order.countDocuments(filter);
  const orders = await Order.find(filter)
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const revenue = await Order.aggregate([
    { $match: { isPaid: true } },
    { $group: { _id: null, total: { $sum: '$totalPrice' } } },
  ]);

  res.json({
    success: true,
    orders,
    total,
    page,
    pages:   Math.ceil(total / limit),
    revenue: revenue[0]?.total || 0,
  });
});

// @desc    Update order status
// @route   PUT /api/orders/admin/:id/status
// @access  Private/Admin
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) {
    res.status(404);
    throw new Error('Order not found');
  }

  order.orderStatus = req.body.status;
  if (req.body.status === 'delivered') {
    order.isDelivered  = true;
    order.deliveredAt  = Date.now();
  }
  if (req.body.trackingNumber) {
    order.trackingNumber = req.body.trackingNumber;
  }

  await order.save();
  res.json({ success: true, order });
});
