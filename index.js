// Підключаємо необхідні бібліотеки
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");

// Налаштовуємо сервер
const port = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Створюємо "кімнати очікування"
const waitingUsers = {
    voice: [],
    text: [],
};

// Створюємо об'єкт для зберігання активних чатів
const activeChats = {};

// Базовий маршрут, щоб перевірити, чи працює сервер
app.get("/", (req, res) => {
    res.send("Сервер HearMe працює!");
});

// Головна логіка, яка спрацьовує при новому підключенні
wss.on("connection", (ws) => {
    ws.id = uuidv4();
    console.log(`[Connect] ✅ Новий користувач підключився: ${ws.id}`);

    ws.send(
        JSON.stringify({
            type: "welcome_message",
            content: "Вітаємо у HearMe! Ви успішно підключились до сервера.",
        }),
    );

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[Message] 📥 Отримано від ${ws.id}:`, data);

            switch (data.type) {
                case "start_search":
                    handleStartSearch(ws, data.mode);
                    break;
                case "cancel_search":
                    removeFromWaiting(ws);
                    break;
                case "text_message":
                    handleTextMessage(ws, data.content);
                    break;
                case "end_chat":
                    handleEndChat(ws);
                    break;
            }
        } catch (error) {
            console.error("[Error] Помилка обробки повідомлення:", error);
        }
    });

    ws.on("close", () => {
        console.log(`[Disconnect] 🔌 Користувач ${ws.id} відключився.`);
        handleDisconnection(ws);
    });
});

function handleStartSearch(user, mode) {
    if (!user || user.readyState !== WebSocket.OPEN) return;
    if (!waitingUsers[mode])
        return console.error(`[Error] Невірний режим пошуку: ${mode}`);
    console.log(`[Search] Користувач ${user.id} шукає '${mode}' чат.`);

    // Видаляємо користувача з усіх попередніх черг
    removeFromWaiting(user);

    // Перевіряємо, чи є хтось у черзі
    if (waitingUsers[mode].length > 0) {
        // Є! Беремо першого користувача з черги
        const partner = waitingUsers[mode].shift(); // .shift() дістає і видаляє перший елемент

        // Перевіряємо, чи партнер ще на зв'язку
        if (!partner || partner.readyState !== WebSocket.OPEN) {
            console.log(
                `[Ghost] Знайдено "привида" у черзі. Повторюємо пошук для ${user.id}`,
            );
            // Партнер від'єднався, поки чекав. Рекурсивно запускаємо пошук для поточного користувача ще раз.
            handleStartSearch(user, mode);
            return;
        }

        console.log(`[Match] 🎉 Знайдено пару! ${user.id} та ${partner.id}.`);

        // Створюємо для них чат
        const chatId = uuidv4();
        user.chatId = chatId;
        partner.chatId = chatId;
        activeChats[chatId] = { user1: user, user2: partner };
        console.log(`[Chat] Створено чат ${chatId}.`);

        // Повідомляємо обох користувачів
        const message = JSON.stringify({ type: "partner_found" });

        console.log(`[Notify] Повідомляємо ${user.id}...`);
        user.send(message);

        console.log(`[Notify] Повідомляємо ${partner.id}...`);
        partner.send(message);
    } else {
        // Якщо нікого немає, додаємо користувача у чергу
        waitingUsers[mode].push(user);
        console.log(
            `[Queue] Користувач ${user.id} доданий у чергу '${mode}'. Поточна черга: ${waitingUsers[mode].length}`,
        );
    }
}

function handleTextMessage(sender, content) {
    const chatId = sender.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const chat = activeChats[chatId];
    const receiver = chat.user1.id === sender.id ? chat.user2 : chat.user1;

    if (receiver && receiver.readyState === WebSocket.OPEN) {
        receiver.send(
            JSON.stringify({ type: "text_message", content: content }),
        );
    }
}

function cleanupChat(chatId) {
    if (activeChats[chatId]) {
        const chat = activeChats[chatId];
        if (chat.user1) chat.user1.chatId = null;
        if (chat.user2) chat.user2.chatId = null;
        delete activeChats[chatId];
        console.log(`[Chat] 🧹 Чат ${chatId} видалено.`);
    }
}

function handleEndChat(user) {
    const chatId = user.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const chat = activeChats[chatId];
    const partner = chat.user1.id === user.id ? chat.user2 : chat.user1;

    if (partner && partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify({ type: "partner_disconnected" }));
    }

    cleanupChat(chatId);
}

function removeFromWaiting(user) {
    if (!user) return;
    Object.keys(waitingUsers).forEach((mode) => {
        const initialLength = waitingUsers[mode].length;
        waitingUsers[mode] = waitingUsers[mode].filter((p) => p.id !== user.id);
        if (waitingUsers[mode].length < initialLength) {
            console.log(
                `[Queue] 🚶‍ Користувач ${user.id} видалений з черги "${mode}"`,
            );
        }
    });
}

function handleDisconnection(user) {
    removeFromWaiting(user);
    handleEndChat(user);
}

server.listen(port, () => {
    console.log(`✅ Сервер успішно запущено на порті ${port}`);
});
