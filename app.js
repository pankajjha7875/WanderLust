require("dotenv").config();
console.log("JWT_SECRET loaded:", !!process.env.JWT_SECRET);

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const Booking = require("./modals/Booking.js");
const Listing = require("./modals/Listing.js");
const User = require("./modals/User.js");

const app = express();
const PORT = process.env.PORT || 8080;
const MONGO_URL = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/Wanderlust";

// ===== Database =====
mongoose
  .connect(MONGO_URL)
  .then(() => console.log("connected to db"))
  .catch((err) => console.log(err));

// ===== Helpers =====
const wrapAsync = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isLoggedIn = (req, res, next) => {
  if (!req.user) return res.redirect("/login");
  next();
};

// Signs a JWT and stores it in an httpOnly cookie
const issueToken = (res, user) => {
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

// ===== View engine =====
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ===== Middleware =====
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));
app.use(cookieParser());

// ===== Auth setup =====
app.use(passport.initialize());
passport.use(new LocalStrategy(User.authenticate()));

// Reads the JWT cookie on every request and sets req.user
app.use(async (req, res, next) => {
  req.user = null;
  const token = req.cookies.token;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(payload.id);
    } catch (e) {
      res.clearCookie("token"); // expired or tampered token
    }
  }
  res.locals.currentUser = req.user;
  next();
});

// ===== Auth routes =====
// Redirect old/wrong URLs to the real routes
app.get("/signup.ejs", (req, res) => res.redirect("/signup"));
app.get("/login.ejs", (req, res) => res.redirect("/login"));

app.get("/signup", (req, res) => {
  res.render("users/signup.ejs");
});

app.post(
  "/signup",
  wrapAsync(async (req, res) => {
    try {
      const { username, email, password } = req.body;
      const user = await User.register(new User({ username, email }), password);
      issueToken(res, user);
      res.redirect("/listings");
    } catch (e) {
      console.log("signup error:", e.message);
      res.redirect("/signup");
    }
  })
);

app.get("/login", (req, res) => {
  res.render("users/login.ejs");
});

app.post(
  "/login",
  passport.authenticate("local", { session: false, failureRedirect: "/login" }),
  (req, res) => {
    issueToken(res, req.user);
    res.redirect("/listings");
  }
);

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/listings");
});

// ===== Listing routes =====
app.get("/", (req, res) => {
  res.render("listings/Home.ejs");
});

app.get(
  "/listings",
  wrapAsync(async (req, res) => {
    const allListings = await Listing.find({});
    res.render("listings/index.ejs", { allListings });
  })
);

// Must stay above /listings/:id
app.get("/listings/new", isLoggedIn, (req, res) => {
  res.render("listings/new.ejs");
});

app.get(
  "/listings/:id",
  wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.redirect("/listings");
    res.render("show.ejs", { listing });
  })
);

app.post(
  "/listings",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const newListing = new Listing(req.body.listing);
    await newListing.save();
    res.redirect("/listings");
  })
);

app.get(
  "/listings/:id/edit",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const listing = await Listing.findById(req.params.id);
    res.render("listings/edit.ejs", { listing });
  })
);

app.put(
  "/listings/:id",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    await Listing.findByIdAndUpdate(id, { ...req.body.listing });
    res.redirect(`/listings/${id}`);
  })
);

app.delete(
  "/listings/:id",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    await Listing.findByIdAndDelete(req.params.id);
    res.redirect("/listings");
  })
);

// ===== Booking routes =====

// Create a booking
app.post(
  "/listings/:id/bookings",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const { id } = req.params;
    console.log("Booking body:", req.body);

    const { checkIn, checkOut, guests } = req.body.booking || {};

    const listing = await Listing.findById(id);
    if (!listing) return res.redirect("/listings");

    const start = new Date(checkIn);
    const end = new Date(checkOut);
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    if (!checkIn || !checkOut || isNaN(start) || isNaN(end)) {
      console.log("Booking rejected: a date is empty or unreadable ->", { checkIn, checkOut });
      return res.redirect(`/listings/${id}`);
    }
    if (start < today) {
      console.log("Booking rejected: check-in is in the past ->", checkIn);
      return res.redirect(`/listings/${id}`);
    }
    if (end <= start) {
      console.log("Booking rejected: check-out must be after check-in ->", { checkIn, checkOut });
      return res.redirect(`/listings/${id}`);
    }

    // Reject if the dates overlap an existing confirmed booking
    const clash = await Booking.findOne({
      listing: id,
      status: "confirmed",
      checkIn: { $lt: end },
      checkOut: { $gt: start },
    });
    if (clash) {
      console.log("Booking rejected: dates already booked");
      return res.redirect(`/listings/${id}`);
    }

    const nights = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const totalPrice = nights * (listing.price || 0);

    const booking = await Booking.create({
      listing: id,
      user: req.user._id,
      checkIn: start,
      checkOut: end,
      guests: Number(guests) || 1,
      totalPrice,
    });

    res.redirect(`/bookings/${booking._id}/success`);
  })
);

// My bookings
app.get(
  "/bookings",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const bookings = await Booking.find({ user: req.user._id })
      .populate("listing")
      .sort({ checkIn: 1 });
    res.render("bookings/index.ejs", { bookings });
  })
);

// Booking confirmation page (only the owner can view it)
app.get(
  "/bookings/:id/success",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    const booking = await Booking.findOne({
      _id: req.params.id,
      user: req.user._id,
    }).populate("listing");

    if (!booking) return res.redirect("/bookings");
    res.render("bookings/success.ejs", { booking });
  })
);

// Cancel a booking (only the owner can)
app.delete(
  "/bookings/:id",
  isLoggedIn,
  wrapAsync(async (req, res) => {
    await Booking.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { status: "cancelled" }
    );
    res.redirect("/bookings");
  })
);

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.log(err);
  res.status(500).send("Something went wrong");
});

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});
// next is netfily frontend depoly 
// and go to the render and host the backend 













// // Next is Custom Error Handlinglpp