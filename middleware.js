const Listing = require("./models/listing");
const Review = require("./models/review");

module.exports.isLoggedIn = (req, res, next)=>{
if(!req.isAuthenticated()){
    req.session.redirectUrl = req.originalUrl;
    req.flash("error","you must be logged in to create listing");
    return res.redirect("/login");
  }
  next();
}

module.exports.saveRedirectUrl=(req,res, next) =>{
if(req.session.redirectUrl){
    res.locals.redirectUrl = req.session.redirectUrl;
}
next()
}
module.exports.isOwner = async (req, res, next) => {
  let { id } = req.params;
  let listing = await Listing.findById(id);

  // If listing does NOT exist → stop here
  if (!listing) {
    req.flash("error", "Listing not found!");
    return res.redirect("/listings");
  }

  // Now listing.owner is safe to access
  if (!listing.owner.equals(res.locals.currUser._id)) {
    req.flash("error", "You don't have permission to edit this listing.");
    return res.redirect(`/listings/${id}`);
  }

  next();
};
module.exports.isReviewAuthor = async (req, res, next) => {
  const { id, reviewId } = req.params;
  const review = await Review.findById(reviewId);

  if ( !review.author.equals(res.locals.currUser._id)) {
    req.flash("error", "You don't have permission to do that.");
    return res.redirect(`/listings/${id}`);
  }

  next();
};

/*module.exports.isReviewAuthor = async (req, res, next) => {
  const { id, reviewId } = req.params;

  const review = await Review.findById(reviewId);

  if (!review) {
    req.flash("error", "Review not found!");
    return res.redirect(`/listings/${id}`);
  }

  if (!review.author) {
    req.flash("error", "Review does not have an author assigned.");
    return res.redirect(`/listings/${id}`);
  }

  if (!req.user || !review.author.equals(req.user._id)) {
    req.flash("error", "You don't have permission to do that.");
    return res.redirect(`/listings/${id}`);
  }

  next();
};*/