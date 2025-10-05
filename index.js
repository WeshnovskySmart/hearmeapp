// Підключаємо необхідні бібліотеки
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");

// ========== ІНІЦІАЛІЗАЦІЯ FIREBASE ==========
// Перевіряємо, чи є ключ у секретах
if (!process.env.FIREBASE_CREDS_JSON) {
    throw new Error("Секретний ключ FIREBASE_CREDS_JSON не знайдено!");
}
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDS_JSON);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
console.log("✅ Успішно підключено до Firebase Firestore!");
// ===============================================

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
    res.send("Сервер HearMe працює! Підключення до бази даних успішне.");
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
            console.log(`[Message] 📥 Отримано від ${ws.id}:`, data.type);

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
                case "webrtc_signal":
                    handleWebRTCSignal(ws, data.signal);
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

    removeFromWaiting(user);
    waitingUsers[mode].push(user);
    console.log(
        `[Queue] Користувач ${user.id} доданий у чергу '${mode}'. В черзі зараз: ${waitingUsers[mode].length}`,
    );

    if (waitingUsers[mode].length >= 2) {
        console.log(
            `[Match] В черзі є ${waitingUsers[mode].length} користувачів. Створюємо пару!`,
        );

        const user1 = waitingUsers[mode].shift();
        const user2 = waitingUsers[mode].shift();

        if (
            !user1 ||
            user1.readyState !== WebSocket.OPEN ||
            !user2 ||
            user2.readyState !== WebSocket.OPEN
        ) {
            console.log(
                `[Ghost] Один зі співрозмовників від'єднався. Повертаємо живих у чергу.`,
            );
            if (user1 && user1.readyState === WebSocket.OPEN)
                waitingUsers[mode].unshift(user1);
            if (user2 && user2.readyState === WebSocket.OPEN)
                waitingUsers[mode].unshift(user2);
            return;
        }

        console.log(`[Match] 🎉 Створено пару: ${user1.id} та ${user2.id}.`);

        const chatId = uuidv4();
        user1.chatId = chatId;
        user2.chatId = chatId;
        activeChats[chatId] = { user1, user2 };
        console.log(`[Chat] Створено чат ${chatId}.`);

        const message1 = JSON.stringify({
            type: "partner_found",
            role: "caller",
        });
        const message2 = JSON.stringify({
            type: "partner_found",
            role: "callee",
        });

        console.log(`[Notify] Повідомляємо ${user1.id} (caller)...`);
        user1.send(message1);

        console.log(`[Notify] Повідомляємо ${user2.id} (callee)...`);
        user2.send(message2);
    }
}

function handleWebRTCSignal(sender, signal) {
    const chatId = sender.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const chat = activeChats[chatId];
    const receiver = chat.user1.id === sender.id ? chat.user2 : chat.user1;

    if (receiver && receiver.readyState === WebSocket.OPEN) {
        receiver.send(
            JSON.stringify({ type: "webrtc_signal", signal: signal }),
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
