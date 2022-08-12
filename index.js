const express = require("express");
const app = express();
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const { Schema } = mongoose;
const bodyparser = require("body-parser");

function gameXO(table) {
  if (
    table[0] !== "XO" &&
    table[1] !== "XO" &&
    table[2] !== "XO" &&
    table[0] === table[1] &&
    table[1] === table[2]
  )
    return table[0];
  else if (
    table[3] !== "XO" &&
    table[4] !== "XO" &&
    table[5] !== "XO" &&
    table[3] === table[4] &&
    table[4] === table[5]
  )
    return table[3];
  else if (
    table[6] !== "XO" &&
    table[7] !== "XO" &&
    table[8] !== "XO" &&
    table[6] === table[7] &&
    table[7] === table[8]
  )
    return table[6];
  else if (
    table[0] !== "XO" &&
    table[3] !== "XO" &&
    table[6] !== "XO" &&
    table[0] === table[3] &&
    table[3] === table[6]
  )
    return table[0];
  else if (
    table[1] !== "XO" &&
    table[4] !== "XO" &&
    table[7] !== "XO" &&
    table[1] === table[4] &&
    table[4] === table[7]
  )
    return table[1];
  else if (
    table[2] !== "XO" &&
    table[5] !== "XO" &&
    table[8] !== "XO" &&
    table[2] === table[5] &&
    table[5] === table[8]
  )
    return table[2];
  else if (
    table[0] !== "XO" &&
    table[4] !== "XO" &&
    table[8] !== "XO" &&
    table[0] === table[4] &&
    table[4] === table[8]
  )
    return table[0];
  else if (
    table[2] !== "XO" &&
    table[4] !== "XO" &&
    table[6] !== "XO" &&
    table[2] === table[4] &&
    table[4] === table[6]
  )
    return table[6];
  else return "XO";
}

const url = "mongodb://0.0.0.0:27017/Game";
mongoose
  .connect(url, {
    useUnifiedTopology: true,
    useNewUrlParser: true
  })
  .then(() => console.log("Database Connected!"))
  .catch((err) => console.log(err));
const StreamShema = new Schema(
  {
    room: { type: String, required: true, unique: true },
    game: Object,
    play: Object,
    state: Object,
    turn: Number,
    msg: Array,
    XO: Array
  },
  { versionKey: false }
);
const Streams = mongoose.model("Stream", StreamShema);
const UserShema = new Schema(
  {
    user: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, unique: true },
    token: { type: String, required: true, unique: true }
  },
  { versionKey: false }
);
const Users = mongoose.model("User", UserShema);

app.use(cors());
app.use(bodyparser.json());

app.use("/login", async (req, res) => {
  const { user, email, password } = req.body;
  const cdt = await Users.findOne().or([{ user }, { email }]);
  if (!cdt || cdt.password !== password)
    return res.status(404).json({ message: "Auth failed" });
  else if (cdt.password === password)
    return res.status(200).json({ is: true, token: cdt.user });
});
app.use("/register", async (req, res) => {
  const { user, email, password } = req.body;
  const cdt = await Users.findOne().or([{ user }, { email }]);
  if (cdt || !user || !email || !password)
    return res.status(404).json({ message: "Auth failed" });
  else {
    let User = new Users({ user, email, password, token: user });
    await User.save();
    return res.status(200).json({ is: true, token: user });
  }
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

io.on("connection", function (socket) {
  socket.on("disconnect", async function () {
    await Streams.deleteMany({});
  });

  socket.on("leave", async function (room) {
    socket.leave(room);
  });

  socket.on("session", async function () {
    socket.emit("session", await Streams.find({}));
  });

  socket.on("chat", async function (data) {
    var info = await Streams.findOne({ room: data.room });
    info.msg.push(data.msg);
    await Streams.findOneAndUpdate({ room: data.room }, { msg: info.msg });
    io.in(data.room).emit("chat", info.msg);
  });

  socket.on("room", async function (info) {
    const cdt = await Streams.findOne({ room: info.room });
    if (cdt) {
      if (cdt.game.X === info.player)
        socket.emit("room", {
          room: info.room,
          type: "X",
          X: cdt.play.X,
          XO: cdt.XO
        });
      else if (cdt.game.O === info.player)
        socket.emit("room", {
          room: info.room,
          type: "O",
          O: cdt.play.O,
          XO: cdt.XO
        });
      else if (!cdt.game.O) {
        var game = { X: cdt.game.X, O: info.player };
        await Streams.findOneAndUpdate({ room: info.room }, { game });
        socket.emit("room", {
          room: info.room,
          type: "O",
          O: cdt.play.O,
          XO: cdt.XO
        });
      } else socket.emit("room", { room: info.room, type: "", XO: cdt.XO });
    } else {
      let Stream = new Streams({
        room: info.room,
        game: { X: info.player },
        play: { X: true, O: false },
        state: { W: "", L: "", D: "" },
        turn: 0,
        msg: [],
        XO: ["XO", "XO", "XO", "XO", "XO", "XO", "XO", "XO", "XO"]
      });
      await Stream.save();
      socket.emit("room", {
        room: info.room,
        type: "X",
        X: true,
        XO: Stream.XO
      });
    }
    socket.join(info.room);
  });

  socket.on("req", async function (data) {
    var info = await Streams.findOne({ room: data.room });
    var draw = await gameXO(data.XO);
    var turn = info.turn + 1;
    var play =
      turn === 9 || draw !== "XO"
        ? { X: false, O: false }
        : { X: !info.play.X, O: !info.play.O };
    if (draw === "XO" && turn === 9) {
      info.msg.push("Draw !");
      await Streams.findOneAndUpdate(
        { room: data.room },
        {
          play,
          state: { W: "", L: "", D: `${info.game.X} ${info.game.O}` },
          turn,
          msg: info.msg,
          XO: data.XO
        }
      );
    } else if (draw === "X") {
      info.msg.push(`Winner: ${info.game.X}`);
      info.msg.push(`Loser: ${info.game.O}`);
      await Streams.findOneAndUpdate(
        { room: data.room },
        {
          play,
          state: { W: info.game.X, L: info.game.O, D: "None" },
          turn,
          msg: info.msg,
          XO: data.XO
        }
      );
    } else if (draw === "O") {
      info.msg.push(`Winner: ${info.game.O}`);
      info.msg.push(`Loser: ${info.game.X}`);
      await Streams.findOneAndUpdate(
        { room: data.room },
        {
          play,
          state: { W: info.game.O, L: info.game.X, D: "None" },
          turn,
          msg: info.msg,
          XO: data.XO
        }
      );
    } else
      await Streams.findOneAndUpdate(
        { room: data.room },
        { play, turn, XO: data.XO }
      );
    io.in(data.room).emit("res", await Streams.findOne({ room: data.room }));
  });
});

server.listen(8000, () => console.log("Listening on port 8000"));
