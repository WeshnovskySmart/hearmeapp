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
// Це об'єкти, де ми будемо зберігати користувачів, які чекають на співрозмовника
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
    // Присвоюємо кожному новому користувачеві унікальний ID
    ws.id = uuidv4();
    console.log(`✅ Новий користувач підключився: ${ws.id}`);

    // Відправляємо привітальне повідомлення новому користувачеві
    ws.send(
        JSON.stringify({
            type: "welcome_message",
            content: "Вітаємо у HearMe! Ви успішно підключились до сервера.",
        }),
    );

    // Обробляємо повідомлення від користувача
    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);
            console.log(`📥 Отримано повідомлення від ${ws.id}:`, data);

            // Обробляємо різні типи повідомлень
            switch (data.type) {
                // Коли користувач починає пошук
                case "start_search":
                    handleStartSearch(ws, data.mode);
                    break;
                // Додамо інші обробники (відправка повідомлення, завершення чату) пізніше
            }
        } catch (error) {
            console.error("Помилка обробки повідомлення:", error);
        }
    });

    // Обробляємо відключення користувача
    ws.on("close", () => {
        console.log(`🔌 Користувач ${ws.id} відключився.`);
        // Потрібно буде додати логіку для завершення чату, якщо користувач був у ньому
    });
});

// Функція для обробки початку пошуку
function handleStartSearch(user, mode) {
    // Перевіряємо, чи існує така "кімната очікування" (voice або text)
    if (!waitingUsers[mode]) {
        console.error(`Невірний режим пошуку: ${mode}`);
        return;
    }

    // Шукаємо партнера у списку очікування
    const waitingPartner = waitingUsers[mode].find((p) => p.id !== user.id);

    if (waitingPartner) {
        // Якщо партнер знайдений!
        console.log(
            `🎉 Знайдено пару! ${user.id} та ${waitingPartner.id} у режимі "${mode}"`,
        );

        // Видаляємо партнера зі списку очікування
        waitingUsers[mode] = waitingUsers[mode].filter(
            (p) => p.id !== waitingPartner.id,
        );

        // Створюємо для них чат
        const chatId = uuidv4();
        activeChats[chatId] = [user, waitingPartner];
        user.chatId = chatId;
        waitingPartner.chatId = chatId;

        // Повідомляємо обох, що пара знайдена
        user.send(JSON.stringify({ type: "partner_found" }));
        waitingPartner.send(JSON.stringify({ type: "partner_found" }));
    } else {
        // Якщо нікого немає, додаємо користувача у список очікування
        console.log(`⏳ Користувач ${user.id} доданий у чергу "${mode}"`);
        // Переконуємось, що користувач не в інших чергах
        Object.keys(waitingUsers).forEach((key) => {
            waitingUsers[key] = waitingUsers[key].filter(
                (u) => u.id !== user.id,
            );
        });
        waitingUsers[mode].push(user);
    }
}

// Запускаємо сервер
server.listen(port, () => {
    console.log(`✅ Сервер успішно запущено на порті ${port}`);
});
