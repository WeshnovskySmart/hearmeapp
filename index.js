// Підключаємо необхідні бібліотеки
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const admin = require("firebase-admin");

// ========== ІНІЦІАЛІЗАЦІЯ FIREBASE ==========
try {
    if (!process.env.FIREBASE_CREDS_JSON) {
        throw new Error("Секретний ключ FIREBASE_CREDS_JSON не знайдено!");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDS_JSON);

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });

    const db = admin.firestore();
    console.log("✅ Успішно підключено до Firebase Firestore!");
} catch (error) {
    console.error("❌ ПОМИЛКА ПІДКЛЮЧЕННЯ FIREBASE:", error.message);
    process.exit(1); // Зупиняємо сервер, якщо немає підключення до БД
}
// ===============================================

const port = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const waitingUsers = { voice: [], text: [] };
const activeChats = {};
const REPORT_LIMIT = 5; // Кількість скарг для бану
const BAN_DURATION_HOURS = 24; // Тривалість бану в годинах

app.get("/", (req, res) => {
    res.send("Сервер HearMe працює! Підключення до бази даних успішне.");
});

wss.on("connection", (ws) => {
    ws.id = uuidv4();
    console.log(`[Connect] ✅ Новий користувач підключився: ${ws.id}`);

    ws.send(JSON.stringify({ type: "welcome_message" }));

    ws.on("message", async (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`[Message] 📥 Отримано від ${ws.id}:`, data.type);

            switch (data.type) {
                case "start_search":
                    await handleStartSearch(ws, data.mode);
                    break;
                case "cancel_search":
                    removeFromWaiting(ws);
                    break;
                case "report_user":
                    await handleReportUser(ws);
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

async function handleStartSearch(user, mode) {
    if (!user || user.readyState !== WebSocket.OPEN) return;

    // **ПЕРЕВІРКА БАНУ**
    try {
        const userRef = db.collection("users").doc(user.id);
        const userDoc = await userRef.get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (
                userData.bannedUntil &&
                userData.bannedUntil.toDate() > new Date()
            ) {
                console.log(
                    `[Ban] Заблокований користувач ${user.id} спробував почати пошук.`,
                );
                user.send(
                    JSON.stringify({
                        type: "you_are_banned",
                        until: userData.bannedUntil.toDate().toISOString(),
                    }),
                );
                user.terminate();
                return;
            }
        }
    } catch (e) {
        console.error("[Firebase Error] Помилка перевірки бану:", e);
    }
    // **КІНЕЦЬ ПЕРЕВІРКИ БАНУ**

    if (!waitingUsers[mode])
        return console.error(`[Error] Невірний режим пошуку: ${mode}`);
    console.log(`[Search] Користувач ${user.id} шукає '${mode}' чат.`);

    removeFromWaiting(user);
    waitingUsers[mode].push(user);
    console.log(
        `[Queue] Користувач ${user.id} доданий у чергу '${mode}'. В черзі зараз: ${waitingUsers[mode].length}`,
    );

    if (waitingUsers[mode].length >= 2) {
        const user1 = waitingUsers[mode].shift();
        const user2 = waitingUsers[mode].shift();
        if (
            !user1 ||
            user1.readyState !== WebSocket.OPEN ||
            !user2 ||
            user2.readyState !== WebSocket.OPEN
        ) {
            if (user1 && user1.readyState === WebSocket.OPEN)
                waitingUsers[mode].unshift(user1);
            if (user2 && user2.readyState === WebSocket.OPEN)
                waitingUsers[mode].unshift(user2);
            return;
        }
        const chatId = uuidv4();
        user1.chatId = chatId;
        user2.chatId = chatId;
        activeChats[chatId] = { user1, user2 };
        const message1 = JSON.stringify({
            type: "partner_found",
            role: "caller",
        });
        const message2 = JSON.stringify({
            type: "partner_found",
            role: "callee",
        });
        user1.send(message1);
        user2.send(message2);
    }
}

async function handleReportUser(reporter) {
    const chatId = reporter.chatId;
    if (!chatId || !activeChats[chatId]) return;

    const chat = activeChats[chatId];
    const reportedUser =
        chat.user1.id === reporter.id ? chat.user2 : chat.user1;
    if (!reportedUser) return;

    console.log(
        `[Report] Користувач ${reporter.id} поскаржився на ${reportedUser.id}`,
    );

    try {
        const userRef = db.collection("users").doc(reportedUser.id);
        const increment = admin.firestore.FieldValue.increment(1);

        await userRef.set({ reportCount: increment }, { merge: true });

        const userDoc = await userRef.get();
        const reportCount = userDoc.data().reportCount || 0;
        console.log(
            `[Report] У користувача ${reportedUser.id} тепер ${reportCount} скарг.`,
        );

        if (reportCount >= REPORT_LIMIT) {
            const banUntil = new Date();
            banUntil.setHours(banUntil.getHours() + BAN_DURATION_HOURS);

            await userRef.update({
                bannedUntil: admin.firestore.Timestamp.fromDate(banUntil),
            });
            console.log(
                `[Ban] 🚫 Користувач ${reportedUser.id} заблокований до ${banUntil.toISOString()}`,
            );

            if (reportedUser.readyState === WebSocket.OPEN) {
                reportedUser.send(
                    JSON.stringify({
                        type: "you_are_banned",
                        until: banUntil.toISOString(),
                    }),
                );
                // Важливо: відключаємо користувача ПІСЛЯ відправки повідомлення
                setTimeout(() => reportedUser.terminate(), 1000);
            }
        }
    } catch (e) {
        console.error("[Firebase Error] Помилка обробки скарги:", e);
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
        waitingUsers[mode] = waitingUsers[mode].filter((p) => p.id !== user.id);
    });
}

function handleDisconnection(user) {
    removeFromWaiting(user);
    handleEndChat(user);
}

server.listen(port, () => {
    console.log(`✅ Сервер успішно запущено на порті ${port}`);
});
