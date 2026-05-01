const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require("socket.io");
const app = express();
const axios = require('axios');
const session = require('express-session');
const AppIDAuthManager = require('ibmcloud-appid').AppIDAuthManager;
const PORT = process.env.PORT || 5000;
const { CloudantV1 } = require('@ibm-cloud/cloudant');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');

// app.use(cors()); 
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false
  }
}));

// 🔐 CONFIG
const clientId = "a7a21aad-2260-471a-9641-e34670028689";
const clientSecret = "Mjk3OTM3MmQtYzcyYy00NzYyLThhMDAtMDMwMjIxZGZhZTgx";
const redirectUri = "https://sportciti-backend-eb03.onrender.com/callback";
const oauthServer = "https://au-syd.appid.cloud.ibm.com/oauth/v4/d0b5261a-80f9-4b6e-93cd-dee154400ea7";

const cloudant = CloudantV1.newInstance({
  authenticator: new IamAuthenticator({
    apikey: "darIH5ZB-QFMIIaufbQZhQG0LFeH-Gl67_TQQlGUqIY1"
  })
});
cloudant.setServiceUrl("https://apikey-v2-2r0xuqymf3hnmcoh2boiax0gwsewl63t83flnkdivgx4:f154c0783d9dbec5a8fb31e81a1ff65c@3aaf7a97-96fb-434c-9588-cf735f03897f-bluemix.cloudantnosqldb.appdomain.cloud");
cloudant.getDatabaseInformation({ db: 'users' })
  .then(() => console.log("Cloudant connected ✅"))
  .catch(err => console.error("Cloudant connection failed ❌", err));

async function createDB() {
  try {
    await cloudant.putDatabase({ db: 'users' });
    console.log("Cloudant DB ready");
  } catch (err) {
    console.log("DB already exists");
  }
}

createDB();
async function createPlayersDB() {
  try {
    await cloudant.putDatabase({ db: 'players' });
    console.log("Players DB ready");
  } catch (err) {
    console.log("Players DB exists");
  }
}

createPlayersDB();
async function seedPlayers() {
  try {
    const existing = await cloudant.postAllDocs({
      db: "players",
      limit: 1
    });

    if (existing.result.rows.length > 0) {
      console.log("Players already seeded ✅");
      return;
    }

    const samplePlayers = [
      {
        name: "Rahul Sharma",
        sport: "Cricket",
        location: "Ahmedabad",
        skillLevel: "Intermediate",
        available: true
      },
      {
        name: "Priya Singh",
        sport: "Badminton",
        location: "Vadodara",
        skillLevel: "Advanced",
        available: true
      }
    ];

    for (const player of samplePlayers) {
      await cloudant.postDocument({
        db: "players",
        document: player
      });
    }

    console.log("Sample players inserted ✅");

  } catch (err) {
    console.error("Seed error:", err);
  }
}

async function createGroundsDB() {
  try {
    await cloudant.putDatabase({ db: 'grounds' });
    console.log("Grounds DB ready");
  } catch (err) {
    console.log("Grounds DB exists");
  }
}

createGroundsDB();
async function seedGrounds() {
  try {
    const existing = await cloudant.postAllDocs({
      db: "grounds",
      limit: 1
    });

    if (existing.result.rows.length > 0) {
      console.log("Grounds already seeded ✅");
      return;
    }

    const sampleGrounds = [
      {
        name: "Ahmedabad Sports Hub",
        location: "Ahmedabad",
        sport: "Football",
        type: "Turf",
        price: 900,
        rating: 4.7,
        reviews: 150,
        amenities: ["Floodlights"],
        available: true,
        latitude: 23.0225,
        longitude: 72.5714
      },
      {
        name: "Vadodara Cricket Ground",
        location: "Vadodara",
        sport: "Cricket",
        type: "Grass",
        price: 1100,
        rating: 4.6,
        reviews: 200,
        amenities: ["Practice Nets"],
        available: true,
        latitude: 22.3072,
        longitude: 73.1812
      }
    ];

    for (const ground of sampleGrounds) {
      await cloudant.postDocument({
        db: "grounds",
        document: ground
      });
    }

    console.log("Sample grounds inserted ✅");

  } catch (err) {
    console.error("Seed error:", err);
  }
}

seedGrounds();
seedPlayers();


// 🔑 LOGIN
app.get('/login', (req, res) => {
  const url = `${oauthServer}/authorization?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}`;
  res.redirect(url);
});

// 🔄 CALLBACK
app.get('/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const response = await axios.post(
      `${oauthServer}/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code: code
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
        }
      }
    );

    // req.session.user = response.data;
    const decoded = JSON.parse(
  Buffer.from(response.data.id_token.split('.')[1], 'base64').toString()
);

const user = {
  _id: decoded.sub,
  name: decoded.name || decoded.email,
  email: decoded.email,
  type: "user"
};

// Save session
req.session.user = user;
// 🔥 AUTO CREATE PLAYER (if not exists)
try {
  const existing = await cloudant.postFind({
    db: "players",
    selector: { userId: user._id }
  });

  if (existing.result.docs.length === 0) {
    await cloudant.postDocument({
      db: "players",
      document: {
        name: user.name,
        sport: "Cricket",
        location: "Ahmedabad",
        skillLevel: "Beginner",
        available: true,
        userId: user._id
      }
    });

    console.log("Player auto-created ✅");
  } else {
    console.log("Player already exists ✅");
  }

} catch (err) {
  console.error("Auto player error:", err);
}

// Save to Cloudant
try {
  const result = await cloudant.postDocument({
    db: 'users',
    document: user
  });

  console.log("User saved to Cloudant:", result.result);
} catch (err) {
  console.error("Cloudant ERROR:", err);
}
console.log("Saving user:", user);
    res.redirect('http://localhost:5173/home');

  } catch (err) {
    console.error(err.response?.data || err);
    res.send("Login failed");
  }
});

function isAuthenticated(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// 🔒 PROTECTED
app.get('/protected', (req, res) => {
  if (!req.session.user) {
    return res.status(401).send("Not logged in");
  }
  res.json(req.session.user);
});

// 🚪 LOGOUT
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('http://localhost:5173');
});

// --- Database Connections ---
// const groundsDb = new Database('grounds.db', { verbose: console.log }); 
// const playersDb = new Database('players.db', { verbose: console.log });
// const messagesDb = new Database('messages.db', { verbose: console.log });

// --- Helper function to generate unique 8-digit string ID ---
function generateUniquePlayerId() {
  let id = '';
  const characters = '0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < 8; i++) {
    id += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return id;
}

// function initializeDatabase() {

//   // --- Messages Table Setup (Existing with TEXT senderId and receiverId) ---
//   messagesDb.exec(`
//     CREATE TABLE IF NOT EXISTS messages (
//       id INTEGER PRIMARY KEY AUTOINCREMENT,
//       senderId TEXT NOT NULL,   
//       receiverId TEXT NOT NULL, 
//       message TEXT NOT NULL,
//       timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
//     );
//   `);
//   console.log('Messages table initialized.');
// }

// initializeDatabase(); // Initialize all databases and tables on server start

// --- HTTP API Routes ---
// 🔥 GET GROUNDS (Cloudant)
app.get('/api/grounds', isAuthenticated, async (req, res) => {
  try {
    const result = await cloudant.postAllDocs({
      db: 'grounds',
      includeDocs: true
    });

    const grounds = result.result.rows.map(row => ({
      ...row.doc,
      amenities: row.doc.amenities || [],
      available: Boolean(row.doc.available)
    }));

    res.json(grounds);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch grounds' });
  }
});

// 🔥 ADD GROUND
app.post('/api/grounds', isAuthenticated, async (req, res) => {
  try {
    const ground = {
      ...req.body,
      userId: req.session.user?.sub
    };

    const result = await cloudant.postDocument({
      db: 'grounds',
      document: ground
    });

    res.json({ success: true, id: result.result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add ground' });
  }
});

// 🔥 GET PLAYERS (Cloudant)
app.get('/api/players', isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.session.user._id;

    const result = await cloudant.postFind({
      db: 'players',
      selector: {
        userId: { "$ne": currentUserId }
      }
    });

    const players = result.result.docs;

    return res.json(players);

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// 🔥 GET PLAYER BY ID
app.get('/api/players/:id', isAuthenticated, async (req, res) => {
  try {
    const result = await cloudant.getDocument({
      db: "players",
      docId: req.params.id
    });

    res.json(result.result);

  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: "Player not found" });
    }

    console.error(err);
    res.status(500).json({ error: "Failed to fetch player" });
  }
});

// 🔥 ADD PLAYER (Cloudant)
app.post('/api/players', isAuthenticated, async (req, res) => {
  try {
    const player = {
      _id: "PLR_" + Date.now(),
      ...req.body,
      userId: req.session.user?._id
    };

    const result = await cloudant.postDocument({
      db: 'players',
      document: player
    });

    res.json({ success: true, id: result.result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add player' });
  }
});

// API endpoint to fetch chat history between two users (IDs are now TEXT)
// app.get('/api/messages/:user1Id/:user2Id', (req, res) => {
//   const { user1Id, user2Id } = req.params;
//   // Ensure consistent order for querying conversation using string comparison
//   const [idA, idB] = [user1Id, user2Id].sort(); // Sort lexicographically for consistency

//   try {
//     const messages = messagesDb.prepare(`
//       SELECT * FROM messages 
//       WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?)
//       ORDER BY timestamp ASC
//     `).all(idA, idB, idB, idA); 
    
//     res.json(messages);
//   } catch (error) {
//     console.error('Error fetching messages:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });


// Root route for server health check
app.get('/', (req, res) => {
  res.send('Backend server for Sportciti is running!');
});

// --- HTTP Server and Socket.IO Server Setup ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173", // Allow your React frontend to connect
    methods: ["GET", "POST"]
  }
});

// Start the HTTP server (which Express app is attached to)
// --- Socket.IO Event Handling (MOVED INSIDE server.listen CALLBACK) ---
// This ensures 'io' is fully initialized and the server is actively listening
// before the WebSocket listeners are set up.
// server.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
//   console.log(`HTTP routes: http://localhost:${PORT}/api/grounds, http://localhost:${PORT}/api/players`);
//   console.log(`WebSocket server running on port ${PORT}`);

//   io.on('connection', (socket) => {
//     console.log('A user connected:', socket.id);

//     // Event to join a specific chat room (roomName will be string-based IDs)
//     socket.on('joinChat', (roomName) => {
//       socket.join(roomName);
//       console.log(`User ${socket.id} joined room: ${roomName}`);
//     });

//     // Event to send a message (senderId, receiverId are now TEXT)
//     socket.on('sendMessage', async (data) => {
//       const { senderId, receiverId, message, roomName } = data;
//       console.log(`Message received for room ${roomName} from ${senderId} to ${receiverId}: ${message}`);

//       try {
//         // Store message in the database
//         const insertMessage = messagesDb.prepare(`
//           INSERT INTO messages (senderId, receiverId, message)
//           VALUES (?, ?, ?)
//         `);
//         const result = insertMessage.run(senderId, receiverId, message);
//         const newMessageId = result.lastInsertRowid; 

//         // Fetch the full message data with timestamp from DB
//         const storedMessage = messagesDb.prepare('SELECT * FROM messages WHERE id = ?').get(newMessageId);

//         // Emit the message to all clients in the specific chat room
//         io.to(roomName).emit('receiveMessage', storedMessage);
//         console.log(`Message stored and emitted to room ${roomName}: ${JSON.stringify(storedMessage)}`);
//       } catch (error) {
//         console.error('Error saving message to DB or emitting:', error);
//         socket.emit('chatError', 'Failed to send message.');
//       }
//     });

//     socket.on('disconnect', () => {
//       console.log('User disconnected:', socket.id);
//     });
//   }); // End of io.on('connection')
// }); // End of server.listen callback

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running on port ${PORT}`);

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Join chat room
    socket.on('joinChat', (roomName) => {
      socket.join(roomName);
      console.log(`User ${socket.id} joined room: ${roomName}`);
    });

    // Send message (NO DATABASE)
    socket.on('sendMessage', (data) => {
      const { senderId, receiverId, message, roomName } = data;

      const msg = {
        senderId,
        receiverId,
        message,
        timestamp: new Date().toISOString()
      };

      // 🔥 emit to room
      io.to(roomName).emit('receiveMessage', msg);

      console.log("Message sent:", msg);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
});

// --- Graceful Shutdown for All Databases ---
process.on('SIGINT', () => {
  console.log('Closing database connections...');
  // groundsDb.close();
  // playersDb.close();
  messagesDb.close(); 
  console.log('Database connections closed.');
  process.exit(0);
});