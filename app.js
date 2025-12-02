

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const Listing = require("./models/listing.js");
const path = require('path')
const methodOverride = require("method-override");
const ejs_mate = require("ejs-mate");
const { listingSchema, reviewSchema } = require("./schema.js")
const Review = require('./models/review.js')
const ExpressError = require("./public/utils/ExpressError.js")
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const User = require("./models/user.js");
const {isLoggedIn, saveRedirectUrl, isOwner ,isReviewAuthor}= require("./middleware.js")
const multer = require("multer");
const { storage } = require("./cloudconfig");
const upload = multer({storage})
const mbxGeocoding = require("@mapbox/mapbox-sdk/services/geocoding");
const geocoder = mbxGeocoding({ accessToken: process.env.MAP_TOKEN });

const port = process.env.PORT||8080;
const MONGO_URL =process.env.MONGO_DB;


main()
  .then(() => {
    console.log("connected to DB");
  })
  .catch((err) => {
    console.log(err);
  });

async function main() {
  await mongoose.connect(MONGO_URL);
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride("_method"));
app.engine('ejs', ejs_mate);
app.use(express.static(path.join(__dirname, "/public")));

const sessionOptions = {
  secret: "mysupersecretcode",
  resave: false,
  saveUninitialized: true,
  cookie: {
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    maxAge: +7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
  },
};


app.use(session(sessionOptions));
app.use(flash())

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use((req, res, next) => {
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.currUser = req.user;
  next();
})


const validateListing = (req, res, next) => {
  const { error } = listingSchema.validate(req.body);
  if (error) {
    const errmsg = error.details.map(el => el.message).join(", ");
    throw new ExpressError(400, errmsg);
  } else {
    next();
  }
};
const validateReview = (req, res, next) => {
  const { error } = reviewSchema.validate(req.body);
  if (error) {
    const errmsg = error.details.map(el => el.message).join(", ");
    throw new ExpressError(400, errmsg);
  } else {
    next();
  }
};
//Index Route
app.get("/listings", async (req, res) => {
  const allListings = await Listing.find({});
  res.render("listings/index.ejs", { allListings });
});

//New Route
app.get("/listings/new",isLoggedIn, (req, res) => {
  res.render("listings/new.ejs");
});

// Show Route
app.get("/listings/:id", async (req, res) => {
  let { id } = req.params;

  const listing = await Listing.findById(id)
    .populate({
      path: "reviews",
      populate: {
        path: "author"
      }
    })
    .populate("owner");

  if (!listing) {
    req.flash("error", "Listing you requested does not exist");
    return res.redirect("/listings");
  }

  res.render("listings/show.ejs", { listing });
});


//Create Route
app.post("/listings", validateListing,isLoggedIn,upload.single("image"),async (req, res) => {
  
  const response = await geocoder
    .forwardGeocode({
      query: req.body.listing.location,
      limit: 1,
    })
    .send();


  let url = req.file.path;
  let filename= req.file.filename;
  const newListing = new Listing(req.body.listing);
  newListing.owner = req.user._id;
  newListing.image = {url, filename}

   
  newListing.geometry= response.body.features[0].geometry;
   
  
   let savedListing= await newListing.save();
   console.log(savedListing)

  req.flash("success", "new listing created successfully");
  res.redirect(`/listings/${newListing._id}`);
});



//Edit Route
app.get("/listings/:id/edit",isLoggedIn,isOwner ,validateListing, async (req, res) => {
  let { id } = req.params;
  const listing = await Listing.findById(id);
  req.flash("success", "edit listing");
  res.render("listings/edit.ejs", { listing });
});

//Update Route
app.put("/listings/:id", isLoggedIn, isOwner, upload.single("image"),async (req, res) => {
  let { id } = req.params;
 
 let Listingg= await Listing.findByIdAndUpdate(id, { ...req.body.listing });
  if (req.file) {
      Listingg.image = {
        url: req.file.path,
        filename: req.file.filename
      };
    }

    await Listingg.save();
  req.flash("success", " listing updated ");
  res.redirect(`/listings/${id}`);
});

//Delete Route
app.delete("/listings/:id",isLoggedIn,isOwner, async (req, res) => {
  let { id } = req.params;
  let deletedListing = await Listing.findByIdAndDelete(id);
  console.log(deletedListing);
  req.flash("success", "listing deleted successfully");
  res.redirect("/listings");
});
// review

app.post("/listings/:id/reviews", validateReview,isLoggedIn,async (req, res) => {
  let listing = await Listing.findById(req.params.id);
  let newReview = new Review(req.body.review);
  newReview.author = req.user._id;
  listing.reviews.push(newReview);

  await newReview.save();
  await listing.save();
  res.redirect(`/listings/${listing._id}`);
})

//delete reviews
app.delete("/listings/:id/reviews/:reviewId",isLoggedIn,isReviewAuthor,async (req, res) => {
  const { id, reviewId } = req.params;
  await Listing.findByIdAndUpdate(id, { $pull: { reviews: reviewId } });
  await Review.findByIdAndDelete(reviewId);

  res.redirect(`/listings/${id}`);
});

// signup form 
app.get("/signup", (req, res) => {
  res.render("users/Signup.ejs")
});
app.post("/signup", async (req, res) => {
  try {
    let { username, password, email } = req.body;
    const newUser = new User({ email, username })
    const registeredUser= await User.register(newUser, password);
    console.log(registeredUser)
    req.login(registeredUser, (err) => {
  if (err) {
    return next(err);
  }
  req.flash("success", "Welcome to Wanderlust!");
  res.redirect("/listings");
});
    

  } catch (err) {
    req.flash("error", err.message);
    res.redirect("/signup");
  }

})
//login form

app.get("/login", (req, res) => {
  res.render("users/Login.ejs");
})
app.post("/login",
  saveRedirectUrl,
  passport.authenticate("local", {
    failureRedirect: '/login',
       failureFlash: true

    }), async (req, res) => {
      req.flash("success","user logined wounderlesh");
      let redirectUrl = res.locals.redirectUrl ||"/listings";
      res.redirect(redirectUrl);

    });
    //logout
    app.get("/logout",(req, res, next)=>{
      req.logout((err)=>{
        if(err){
          return next(err);
        }
        req.flash("success", "you are logout!");
        res.redirect("/listings")
      })
    })
// app.get("/testListing", async (req, res) => {
//   let sampleListing = new Listing({
//     title: "My New Villa",
//     description: "By the beach",
//     price: 1200,
//     location: "Calangute, Goa",
//     country: "India",
//   });

//   await sampleListing.save();
//   console.log("sample was saved");
//   res.send("successful testing");
// });

app.listen(port, () => {
  console.log(`server is listening on port ${port}`);
});
//project part 1(a) complete