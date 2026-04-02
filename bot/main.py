import asyncio
import aiosqlite
import os
from typing import Callable, Dict, Any, Awaitable

from aiogram import Bot, Dispatcher, F, BaseMiddleware
from aiogram.types import Message, ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton, \
    TelegramObject
from aiogram.filters import Command, CommandObject  # Добавили CommandObject для парсинга диплинков

# Импорты наших модулей
from config import RYFT
from admin import set_commands, send_db_files, send_broadcast
from database import init_db

API_TOKEN = RYFT
bot = Bot(API_TOKEN)
dp = Dispatcher()
ADMIN_ID = 861703506


# ========== Блокировщик Тех. Работ (Middleware) ==========
class MaintenanceMiddleware(BaseMiddleware):
    async def __call__(
            self,
            handler: Callable[[TelegramObject, Dict[str, Any]], Awaitable[Any]],
            event: TelegramObject,
            data: Dict[str, Any]
    ) -> Any:
        user = data.get("event_from_user")
        if user and user.id != ADMIN_ID:
            if os.path.exists(".maintenance"):
                if hasattr(event, "answer"):
                    await event.answer(
                        "🛠 <b>Ведутся технические работы!</b>\n\n"
                        "Система временно недоступна в связи с установкой обновления. Скоро мы вернемся!",
                        parse_mode="HTML"
                    )
                return
        return await handler(event, data)


dp.message.outer_middleware(MaintenanceMiddleware())
dp.callback_query.outer_middleware(MaintenanceMiddleware())


# ========== Работа с БД (Регистрация и Синхронизация) ==========
async def register_and_sync_user(user) -> int:
    """Регистрирует юзера по tg_id и возвращает внутренний user_id"""
    async with aiosqlite.connect("swimming_bot.db") as db:
        # Ищем пользователя по tg_id
        async with db.execute("SELECT user_id FROM users WHERE tg_id = ?", (user.id,)) as cursor:
            row = await cursor.fetchone()

        username_lower = user.username.lower() if user.username else None

        if row:
            internal_user_id = row[0]
            # Обновляем юзернейм и имя (вдруг юзер их поменял в ТГ)
            await db.execute(
                "UPDATE users SET username = ?, full_user_name = ? WHERE user_id = ?",
                (username_lower, user.full_name, internal_user_id)
            )
        else:
            # Создаем нового пользователя
            cursor = await db.execute(
                "INSERT INTO users (tg_id, username, full_user_name) VALUES (?, ?, ?)",
                (user.id, username_lower, user.full_name)
            )
            internal_user_id = cursor.lastrowid
            # Создаем связанные записи в других таблицах по внутреннему user_id
            await db.execute("INSERT OR IGNORE INTO profile_cards (user_id) VALUES (?)", (internal_user_id,))
            await db.execute("INSERT OR IGNORE INTO premium_settings (user_id) VALUES (?)", (internal_user_id,))

        await db.commit()
        return internal_user_id


# ========== Клавиатуры ==========
def get_main_menu_kb():
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="⚡️ Открыть RYFT")],
            [KeyboardButton(text="📢 Канал"), KeyboardButton(text="👨‍💻 Поддержка")]
        ],
        resize_keyboard=True,
        is_persistent=True
    )


def get_launch_inline_kb():
    # Если хочешь, чтобы приложение всегда открывалось через бота, оставляем так:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🚀 Открыть приложение", url="https://t.me/RyftAppBot/RYFT")]
    ])


# ========== Команды и Хендлеры ==========
@dp.message(Command("start"))
async def start_command(message: Message, command: CommandObject):
    # 1. Сначала регистрируем или находим юзера, получаем внутренний ID
    internal_user_id = await register_and_sync_user(message.from_user)

    # 2. Если это авторизация из браузера
    if command.args and command.args.startswith("auth_"):
        auth_code = command.args
        async with aiosqlite.connect("swimming_bot.db") as db:
            # Привязываем код именно к внутреннему ID
            await db.execute(
                "UPDATE users SET auth_code = ? WHERE user_id = ?",
                (auth_code, internal_user_id)
            )
            await db.commit()

        await message.answer(
            "✅ <b>Вход подтвержден!</b>\n\n"
            "Вы успешно авторизовали сессию в браузере. Вернитесь на сайт, он обновится через несколько секунд.",
            parse_mode="HTML"
        )
        return

    # 3. Если это обычный /start (без параметров)
    text = (
        "🐋 <b>Добро пожаловать в экосистему RYFT!</b>\n\n"
        "Ваш личный профиль, нормативы, ГПС и рекорды теперь доступны в нашем новом приложении.\n\n"
        "👇 Нажмите кнопку ниже для входа."
    )
    await message.answer(text, reply_markup=get_main_menu_kb(), parse_mode="HTML")


@dp.message(F.text == "⚡️ Открыть RYFT")
async def open_ryft_handler(message: Message):
    await message.answer(
        "⚡️ <b>Нажмите на кнопку ниже, чтобы запустить Mini App:</b>\n",
        reply_markup=get_launch_inline_kb(),
        parse_mode="HTML"
    )


@dp.message(F.text == "📢 Канал")
async def channel_handler(message: Message):
    await message.answer("📢 <b>Официальный канал и сообщество RYFT:</b>\nhttps://t.me/ryft_hub", parse_mode="HTML")


@dp.message(F.text == "👨‍💻 Поддержка")
async def support_handler(message: Message):
    await message.answer("👨‍💻 <b>Служба поддержки:</b>\nПо всем техническим вопросам обращайтесь к @knoooox",
                         parse_mode="HTML")


# ========== Админские хендлеры ==========
dp.message.register(send_db_files, F.text.lower().in_(["бд", "база", "get db", "db"]))
dp.message.register(send_broadcast, Command("noti"))


# ========== ЗАПУСК БОТА ==========
async def main():
    await init_db()
    await set_commands(bot)
    print("Бот успешно запущен и готов к работе!")
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())