const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = asyncHandler(async (req, res) => {
  const page     = parseInt(req.query.page)  || 1;
  const limit    = parseInt(req.query.limit) || 12;
  const skip     = (page - 1) * limit;

  // Build query
  const queryObj = {};

  // Search
  if (req.query.search) {
    queryObj.$text = { $search: req.query.search };
  }

  // Category filter
  if (req.query.category) {
    queryObj.category = req.query.category;
  }

  // Price range
  if (req.query.minPrice || req.query.maxPrice) {
    queryObj.price = {};
    if (req.query.minPrice) queryObj.price.$gte = Number(req.query.minPrice);
    if (req.query.maxPrice) queryObj.price.$lte = Number(req.query.maxPrice);
  }

  // Rating filter
  if (req.query.rating) {
    queryObj.ratings = { $gte: Number(req.query.rating) };
  }

  // Featured
  if (req.query.featured) {
    queryObj.isFeatured = true;
  }

  // In stock
  if (req.query.inStock) {
    queryObj.stock = { $gt: 0 };
  }

  // Sort
  let sortBy = { createdAt: -1 };
  if (req.query.sort) {
    const sortMap = {
      'price-asc':    { price: 1 },
      'price-desc':   { price: -1 },
      'rating':       { ratings: -1 },
      'newest':       { createdAt: -1 },
      'popular':      { numReviews: -1 },
    };
    sortBy = sortMap[req.query.sort] || sortBy;
  }

  const total    = await Product.countDocuments(queryObj);
  const products = await Product.find(queryObj)
    .sort(sortBy)
    .skip(skip)
    .limit(limit)
    .populate('seller', 'name');

  res.json({
    success: true,
    count:      products.length,
    total,
    page,
    pages:      Math.ceil(total / limit),
    products,
  });
});

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
exports.getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate('seller', 'name email')
    .populate('reviews.user', 'name avatar');

  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  res.json({ success: true, product });
});

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
exports.createProduct = asyncHandler(async (req, res) => {
  req.body.seller = req.user.id;

  const product = await Product.create(req.body);
  res.status(201).json({ success: true, product });
});

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = asyncHandler(async (req, res) => {
  let product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  product = await Product.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  res.json({ success: true, product });
});

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  await product.deleteOne();
  res.json({ success: true, message: 'Product removed' });
});

// @desc    Create product review
// @route   POST /api/products/:id/reviews
// @access  Private
exports.createReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  // Check if already reviewed
  const alreadyReviewed = product.reviews.find(
    (r) => r.user.toString() === req.user.id.toString()
  );
  if (alreadyReviewed) {
    res.status(400);
    throw new Error('You have already reviewed this product');
  }

  product.reviews.push({
    user:    req.user.id,
    name:    req.user.name,
    rating:  Number(rating),
    comment,
  });

  product.calculateRatings();
  await product.save();

  res.status(201).json({ success: true, message: 'Review added' });
});

// @desc    Delete review
// @route   DELETE /api/products/:id/reviews/:reviewId
// @access  Private
exports.deleteReview = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) {
    res.status(404);
    throw new Error('Product not found');
  }

  const reviewIndex = product.reviews.findIndex(
    (r) => r._id.toString() === req.params.reviewId
  );
  if (reviewIndex === -1) {
    res.status(404);
    throw new Error('Review not found');
  }

  // Only the reviewer or admin can delete
  if (
    product.reviews[reviewIndex].user.toString() !== req.user.id &&
    req.user.role !== 'admin'
  ) {
    res.status(403);
    throw new Error('Not authorized to delete this review');
  }

  product.reviews.splice(reviewIndex, 1);
  product.calculateRatings();
  await product.save();

  res.json({ success: true, message: 'Review deleted' });
});

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
exports.getFeaturedProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({ isFeatured: true, stock: { $gt: 0 } })
    .limit(8)
    .sort({ createdAt: -1 });
  res.json({ success: true, products });
});
