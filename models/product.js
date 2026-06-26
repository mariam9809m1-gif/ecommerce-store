const mongoose = require('mongoose');
const slugify = require('slugify');

const reviewSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
  },
  { timestamps: true }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please enter product name'],
      trim: true,
      maxlength: [200, 'Product name cannot exceed 200 characters'],
    },
    slug: String,
    description: {
      type: String,
      required: [true, 'Please enter product description'],
    },
    price: {
      type: Number,
      required: [true, 'Please enter product price'],
      maxlength: [8, 'Price cannot exceed 8 digits'],
      default: 0.0,
    },
    discountPrice: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    category: {
      type: String,
      required: [true, 'Please select a category'],
      enum: [
        'Electronics',
        'Books',
        'Clothing',
        'Shoes',
        'Beauty',
        'Sports',
        'Home & Kitchen',
        'Toys',
        'Automotive',
        'Health',
        'Grocery',
        'Other',
      ],
    },
    brand: { type: String, default: '' },
    images: [
      {
        public_id: { type: String, required: true },
        url: { type: String, required: true },
      },
    ],
    stock: {
      type: Number,
      required: [true, 'Please enter product stock'],
      maxlength: [5, 'Stock cannot exceed 5 digits'],
      default: 1,
    },
    ratings: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 },
    reviews: [reviewSchema],
    isFeatured: { type: Boolean, default: false },
    tags: [String],
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

// Create slug from name
productSchema.pre('save', function (next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

// Calculate average rating
productSchema.methods.calculateRatings = function () {
  if (this.reviews.length === 0) {
    this.ratings = 0;
    this.numReviews = 0;
  } else {
    const avg =
      this.reviews.reduce((acc, r) => acc + r.rating, 0) / this.reviews.length;
    this.ratings = Math.round(avg * 10) / 10;
    this.numReviews = this.reviews.length;
  }
};

// Indexes
productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ category: 1, price: 1 });
productSchema.index({ slug: 1 });

module.exports = mongoose.model('Product', productSchema);
