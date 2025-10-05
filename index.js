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
    if (!waitingUsers[mode]) {
        console.error(`Невірний режим пошуку: ${mode}`);
        return;
    }

    // Очищуємо "привидів" з черги
    waitingUsers[mode] = waitingUsers[mode].filter(
        (p) => p.readyState === WebSocket.OPEN,
    );

    const waitingPartner = waitingUsers[mode].find((p) => p.id !== user.id);

    if (waitingPartner) {
        console.log(
            `🎉 Знайдено пару! ${user.id} та ${waitingPartner.id} у режимі "${mode}"`,
        );

        waitingUsers[mode] = waitingUsers[mode].filter(
            (p) => p.id !== waitingPartner.id,
        );

        const chatId = uuidv4();
        activeChats[chatId] = [user, waitingPartner];
        user.chatId = chatId;
        waitingPartner.chatId = chatId;

        user.send(JSON.stringify({ type: "partner_found" }));
        waitingPartner.send(JSON.stringify({ type: "partner_found" }));
    } else {
        console.log(`⏳ Користувач ${user.id} доданий у чергу "${mode}"`);
        Object.keys(waitingUsers).forEach((key) => {
            waitingUsers[key] = waitingUsers[key].filter(
                (u) => u.id !== user.id,
            );
        });
        waitingUsers[mode].push(user);
    }
}

function handleTextMessage(sender, content) {
    const chatId = sender.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const receiver = activeChats[chatId].find((p) => p.id !== sender.id);

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
        activeChats[chatId].forEach((user) => {
            if (user) user.chatId = null;
        });
        delete activeChats[chatId];
        console.log(`🧹 Чат ${chatId} видалено.`);
    }
}

function handleEndChat(user) {
    const chatId = user.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const partner = activeChats[chatId].find((p) => p.id !== user.id);

    if (partner && partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify({ type: "partner_disconnected" }));
    }

    cleanupChat(chatId);
}

function handleDisconnection(user) {
    // 1. Видаляємо з черги очікування
    Object.keys(waitingUsers).forEach((mode) => {
        waitingUsers[mode] = waitingUsers[mode].filter((p) => p.id !== user.id);
    });

    // 2. Завершуємо активний чат, якщо він був
    handleEndChat(user);
}

server.listen(port, () => {
    console.log(`✅ Сервер успішно запущено на порті ${port}`);
});
