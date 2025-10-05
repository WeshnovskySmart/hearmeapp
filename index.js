// Підключення необхідних бібліотек
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

// Налаштування сервера
// Railway/Replit нададуть порт автоматично через process.env.PORT
const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Ця функція спрацьовує, коли хтось підключається
wss.on("connection", (ws) => {
    console.log("🔗 Новий користувач підключився!");

    // Обробка повідомлень від користувача
    ws.on("message", (message) => {
        console.log(`📥 Отримано повідомлення: ${message}`);
        ws.send(`Сервер отримав ваше повідомлення: ${message}`);
    });

    // Обробка відключення
    ws.on("close", () => {
        console.log("👋 Користувач відключився.");
    });

    ws.send("Вітаємо у HearMe! Ви успішно підключились до сервера.");
});

// Додатковий маршрут для перевірки роботи сервера через браузер
app.get("/", (req, res) => {
    res.send("<h1>Сервер HearMe працює!</h1>");
});

// Запуск сервера
server.listen(PORT, () => {
    console.log(`✅ Сервер успішно запущено на порті ${PORT}`);
});
