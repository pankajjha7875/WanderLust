const mongoose = require("mongoose"); // Corrected 'required' to 'require' and 'mongoodse' to 'mongoose'
const Schema = mongoose.Schema;
const ListingSchema = new Schema({
    title: {
      type: String, // Mongoose SchemaType 'String' should be capitalized
      required: true,
    },
    description:{
     type: String, // Mongoose SchemaType 'String' should be capitalized
     required:true,
    },
    image: {
  filename: {
    type: String,
    default: "listingimage",
  },
  url: {
    type: String,
    default: "https://www.vecteezy.com/free-photos/image", // real image URL, see below
    set: (v) => (v === "" ? "https://www.vecteezy.com/free-photos/image" : v),
  },
},
    price:{ // Changed 'Price' to 'price' for conventional camelCase
        type: Number, // Mongoose SchemaType 'Number' should be capitalized
        required:true,
    },
    location:{
        type: String, // Mongoose SchemaType 'String' should be capitalized
        required:true,
    },
    country:{
        type: String, // Mongoose SchemaType 'String' should be capitalized
        required:true,
    },
});
const Listing = mongoose.model("Listing", ListingSchema);
module.exports = Listing; // Corrected 'module.export - Listing' to 'module.exports = Listing'*/

