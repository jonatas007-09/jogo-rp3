// server/server.js
import { WebSocketServer } from "ws";
import crypto from "crypto";

const PORT = process.env.PORT || 8080;
const wss = new WebSocketServer({ port: PORT });

const rooms = new Map(); // room -> Map(id -> player)

function uid(){
  return crypto.randomBytes(8).toString("hex");
}
function safeStr(s, max=16){
  return String(s ?? "").trim().slice(0, max);
}
function broadcastRoom(room, obj){
  const pack = JSON.stringify(obj);
  const map = rooms.get(room);
  if (!map) return;
  for (const p of map.values()){
    if (p.ws.readyState === 1) p.ws.send(pack);
  }
}
function roomState(room){
  const map = rooms.get(room);
  if (!map) return [];
  const arr = [];
  for (const p of map.values()){
    arr.push({
      id: p.id,
      name: p.name,
      x: p.x, y: p.y, z: p.z,
      yaw: p.yaw,
      ts: p.ts
    });
  }
  return arr;
}

// manda estado 10x/s
setInterval(()=>{
  for (const [room, map] of rooms){
    if (!map.size) continue;
    broadcastRoom(room, { t: "state", room, players: roomState(room) });
  }
}, 100);

wss.on("connection", (ws) => {
  const id = uid();

  const player = {
    id,
    ws,
    room: "",
    name: "Player",
    x: 18, y: 0, z: 18,
    yaw: 0,
    ts: Date.now(),
  };

  ws.send(JSON.stringify({ t: "welcome", id }));

  ws.on("message", (raw) => {
    let msg = null;
    try { msg = JSON.parse(raw.toString("utf8")); } catch { return; }
    if (!msg || !msg.t) return;

    if (msg.t === "join"){
      const room = safeStr(msg.room, 12);
      const name = safeStr(msg.name, 16) || "Player";
      if (!room){
        ws.send(JSON.stringify({ t:"error", message:"Sala inválida" }));
        return;
      }

      // sai da sala antiga
      if (player.room){
        const old = rooms.get(player.room);
        if (old){
          old.delete(player.id);
          broadcastRoom(player.room, { t:"left", id: player.id });
          if (!old.size) rooms.delete(player.room);
        }
      }

      player.room = room;
      player.name = name;

      if (!rooms.has(room)) rooms.set(room, new Map());
      rooms.get(room).set(player.id, player);

      // state instantâneo
      broadcastRoom(room, { t:"state", room, players: roomState(room) });
      return;
    }

    if (msg.t === "me"){
      if (!player.room) return;
      player.x = +msg.x || 0;
      player.y = +msg.y || 0;
      player.z = +msg.z || 0;
      player.yaw = +msg.yaw || 0;
      player.ts = Date.now();
      return;
    }
  });

  ws.on("close", () => {
    if (player.room){
      const map = rooms.get(player.room);
      if (map){
        map.delete(player.id);
        broadcastRoom(player.room, { t:"left", id: player.id });
        if (!map.size) rooms.delete(player.room);
      }
    }
  });
});

console.log("WebSocket server running on port", PORT);
