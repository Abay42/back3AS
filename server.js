const express = require("express");
const axios = require("axios");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path"); 
const app = express();
const jwt = require("jsonwebtoken");
const secretKey = "your-secret-key";
const newsApiKey = "5a24fadc362648188f6413575df11280";
const nasaApiKey = "QAiTkTLPT0pfR1RxNyPLQutpBOcPZN6hoMSlJEwe";

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect("mongodb+srv://veyesss:1@cluster0.ewtj4vw.mongodb.net/", { useNewUrlParser: true, useUnifiedTopology: true });

const userSchema = new mongoose.Schema({
  userID: mongoose.Schema.Types.ObjectId,
  username: String,
  password: String,
  creationDate: { type: Date, default: Date.now },
  updateDate: { type: Date, default: Date.now },
  deletionDate: { type: Date, default: null },
  isAdmin: { type: Boolean, default: false },
  searches: [{ city: String, timestamp: Date, weatherData: Object }],
});

const User = mongoose.model("User", userSchema);

const authenticateUser = (req, res, next) => {
  if (req.path.startsWith('/news') || req.path.startsWith('/nasa')) {
    return next();
  }
  if (req.session && req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

const authenticateToken = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.redirect("/login");
  }

  jwt.verify(token, secretKey, (err, user) => {
    if (err) {
      return res.redirect("/login");
    }

    req.user = user;
    next();
  });
};

const isAdmin = async (req, res, next) => {
  try {
    if (req.user && req.user.username) {
      const username = req.user.username;

      const user = await User.findOne({ username });

      if (user && user.isAdmin) {
        return next(); 
      }
    }

    res.redirect("/login");
  } catch (error) {
    console.error("Error checking admin status:", error);
    res.redirect("/login");
  }
};


app.get("/admin", authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await User.find();
    res.render("admin", { user: req.user, users });
  } catch (error) {
    console.error("Error fetching users for admin:", error);
    res.redirect("/login");
  }
});

app.get("/admin/users", isAdmin,async (req, res) => {
  try {
    const users = await User.find({ isAdmin: false });
    res.render("adminUsers", { users });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.render("adminUsers", { error: "Error fetching users. Please try again." });
  }
});


app.get("/admin/users/:userId/delete", authenticateToken, async (req, res) => {
  try {
    console.log("Authenticated User:", req.user);

    const userId = req.params.userId;
    const userToDelete = await User.findById(userId);
    console.log("User to Delete:", userToDelete);

    if (!userToDelete) {
      return res.status(404).send("User not found.");
    }

    await User.findByIdAndDelete(userId);

    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error deleting user:", error);
    res.redirect("/admin/users");
  }
});

app.get("/admin/users/:userId/edit", authenticateToken, isAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const foundUser = await User.findById(userId);
    res.render("editUser", { user: foundUser });
  } catch (error) {
    console.error("Error fetching user for edit:", error);
    res.redirect("/admin/users");
  }
});

app.post("/admin/users/:userId/edit", authenticateToken, isAdmin, async (req, res) => {
  try {
    const userId = req.params.userId;
    const { username, password } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      console.error("User not found.");
      return res.redirect("/admin/users");
    }

    user.username = username;
  
    if (password) {
      user.password = password;
    }

    await user.save();

    res.redirect("/admin/users");
  } catch (error) {
    console.error("Error updating user:", error);
    res.redirect("/admin/users");
  }
});

app.get("/signup", (req, res) => {
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  const { username, password } = req.body;

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      res.render("signup", { error: "Username already exists. Please choose another." });
    } else {
      const newUser = new User({ username, password });
      await newUser.save();
      const token = jwt.sign({ username: newUser.username }, secretKey);
      res.cookie("token", token, { httpOnly: true });
      res.redirect("/login");
    }
  } catch (error) {
    res.render("signup", { error: "Error during sign up. Please try again." });
  }
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({ username, password });
    if (user) {
      const token = jwt.sign({ username: user.username }, secretKey);
      res.cookie("token", token, { httpOnly: true });
      res.redirect("/");
    } else {
      res.render("login", { error: "Invalid username or password" });
    }
  } catch (error) {
    res.render("login", { error: "Error during login. Please try again." });
  }
});

app.get("/weather", async (req, res) => {
  const city = req.query.city;
  const weatherAPIUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=0533eafb2e2f7249f62e71f35c3303aa&units=metric`;

  let weather;
  let error = null;

  try {
    const response = await axios.get(weatherAPIUrl);
    weather = response.data;

    if (req.user) {
      const { username } = req.user;
      const timestamp = Date.now();

      await User.updateOne(
        { username },
        {
          $push: {
            searches: {
              city,
              timestamp,
              weatherData: weather,
            },
          },
        }
      );
    }
  } catch (error) {
    weather = null;
    error = "Error fetching weather data. Please try again.";
  }

  if (req.user) {
    const { username } = req.user;
    const user = await User.findOne({ username });
    const lastSearch = user.searches[user.searches.length - 1];

    res.render("index", { weather: lastSearch.weatherData, error });
  } else {
    res.render("index", { weather, error });
  }
});

app.get("/news", (req, res) => {
  res.render("news", { newsData: null });
});

app.post("/news", authenticateUser, async (req, res) => {
  try {
    const city = req.body.city;
    const newsAPIUrl = `https://newsapi.org/v2/everything?q=${city}&apiKey=${newsApiKey}`;
    const response = await axios.get(newsAPIUrl);
    const newsData = response.data.articles;

    console.log("News API Response:", response.data);

    res.render('news', { newsData });
  } catch (error) {
    console.error('Error fetching news data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get("/nasa", authenticateUser, async (req, res) => {
  try {
    const response = await axios.get("https://api.le-systeme-solaire.net/rest/bodies/", {
      headers: {
        "Authorization": `Bearer ${nasaApiKey}`,
      },
    });

    const celestialBodies = response.data.bodies;

    console.log("NASA API Response:", celestialBodies);

    res.render('nasa', { celestialBodies });
  } catch (error) {
    console.error('Error fetching NASA data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get("/history", authenticateToken, async (req, res) => {
  try {
    const { username } = req.user;
    const user = await User.findOne({ username });

    if (user) {
      console.log("User found:", user);
      console.log("Searches array:", user.searches);
      res.render("history", { history: user.searches.reverse() });
    } else {
      console.error("User not found");
      res.redirect("/");
    }
  } catch (error) {
    console.error("Error fetching search history:", error);
    res.redirect("/");
  }
});


app.get("/", (req, res) => {
  res.render("index", { weather: null, news: null, error: null });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`App is running on port ${port}`);
});
