// Підключаємо необхідні бібліотеки
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid"); // Для генерації унікальних ID

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
    console.log(`✅ Новий користувач підключився: ${ws.id}`);

    ws.send(
        JSON.stringify({
            type: "welcome_message",
            content: "Вітаємо у HearMe! Ви успішно підключились до сервера.",
        }),
    );

    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📥 Отримано повідомлення від ${ws.id}:`, data);

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
            console.error("Помилка обробки повідомлення:", error);
        }
    });

    ws.on("close", () => {
        console.log(`🔌 Користувач ${ws.id} відключився.`);
        handleDisconnection(ws);
    });
});

function handleStartSearch(user, mode) {
    if (!user || user.readyState !== WebSocket.OPEN) return;
    if (!waitingUsers[mode])
        return console.error(`Невірний режим пошуку: ${mode}`);

    // Спочатку видаляємо користувача з усіх черг, щоб уникнути дублікатів
    removeFromWaiting(user);

    const waitingPartner = waitingUsers[mode].find(
        (p) => p && p.readyState === WebSocket.OPEN && p.id !== user.id,
    );

    if (waitingPartner) {
        console.log(
            `🎉 Знайдено пару! ${user.id} та ${waitingPartner.id} у режимі "${mode}"`,
        );

        removeFromWaiting(waitingPartner);

        const chatId = uuidv4();
        activeChats[chatId] = { user1: user, user2: waitingPartner };
        user.chatId = chatId;
        waitingPartner.chatId = chatId;

        const partnerFoundMessage = JSON.stringify({ type: "partner_found" });

        if (user.readyState === WebSocket.OPEN) user.send(partnerFoundMessage);
        if (waitingPartner.readyState === WebSocket.OPEN)
            waitingPartner.send(partnerFoundMessage);
    } else {
        console.log(`⏳ Користувач ${user.id} доданий у чергу "${mode}"`);
        waitingUsers[mode].push(user);
    }
}

function handleTextMessage(sender, content) {
    const chatId = sender.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const chat = activeChats[chatId];
    const receiver = chat.user1.id === sender.id ? chat.user2 : chat.user1;

    if (receiver && receiver.readyState === WebSocket.OPEN) {
        receiver.send(
            JSON.stringify({
                type: "text_message",
                content: content,
            }),
        );
    }
}

function cleanupChat(chatId) {
    if (activeChats[chatId]) {
        const chat = activeChats[chatId];
        if (chat.user1) chat.user1.chatId = null;
        if (chat.user2) chat.user2.chatId = null;
        delete activeChats[chatId];
        console.log(`🧹 Чат ${chatId} видалено.`);
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
        const index = waitingUsers[mode].findIndex((p) => p.id === user.id);
        if (index > -1) {
            waitingUsers[mode].splice(index, 1);
            console.log(
                `🚶‍ Користувач ${user.id} видалений з черги "${mode}"`,
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
