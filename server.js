require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connesso'))
  .catch(err => console.error('Errore MongoDB:', err));

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String
});

const sessionSchema = new mongoose.Schema({
  name: String,
  masterId: mongoose.Schema.Types.ObjectId,
  playerCount: Number,
  currentPhase: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true }
});

const characterSchema = new mongoose.Schema({
  sessionId: mongoose.Schema.Types.ObjectId,
  userId: mongoose.Schema.Types.ObjectId,
  firstName: String,
  lastName: String,
  profession: String,
  relationshipToMaster: String,
  isMurderer: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);
const Character = mongoose.model('Character', characterSchema);

app.get('/', (req, res) => {
  res.json({ message: 'Murder Mystery API funzionante!' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, email, password: hashedPassword });
    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, username, email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, username: user.username, email } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions', async (req, res) => {
  try {
    const session = new Session(req.body);
    await session.save();
    res.json(session);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await Session.find({ isActive: true });
    res.json(sessions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/characters', async (req, res) => {
  try {
    const character = new Character(req.body);
    await character.save();
    io.to(req.body.sessionId).emit('characterCreated', character);
    res.json(character);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions/:id/characters', async (req, res) => {
  try {
    const characters = await Character.find({ sessionId: req.params.id });
    res.json(characters);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

io.on('connection', (socket) => {
  socket.on('joinSession', (sessionId) => socket.join(sessionId));
  socket.on('phaseChange', ({ sessionId, phase }) => {
    io.to(sessionId).emit('phaseUpdated', phase);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
