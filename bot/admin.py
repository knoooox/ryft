import asyncio
import aiosqlite
import os
from aiogram import types, Bot
from aiogram.types import FSInputFile, BotCommand, BotCommandScopeChat

ADMIN_ID = 861703506

# ========== Запрос БД для админа ==========
async def send_db_files(message: types.Message):
    if message.from_user.id != ADMIN_ID:
        return

    # Теперь бот присылает ВСЕ три базы данных
    db_files = ["swimming_bot.db", "gps.db", "swimming_data.db"]
    found_any = False

    for file_name in db_files:
        if os.path.exists(file_name):
            try:
                document = FSInputFile(path=file_name)
                await message.answer_document(
                    document=document,
                    caption=f"📦 Файл базы данных: <b>{file_name}</b>",
                    parse_mode="HTML"
                )
                found_any = True
            except Exception as e:
                await message.answer(f"❌ Ошибка при отправке {file_name}: {e}")
        else:
            await message.answer(f"⚠️ Файл {file_name} не найден")

    if not found_any:
        await message.answer("⚠️ Ни один из файлов базы данных не найден")


# ========== Рассылка (Broadcast) ==========
async def send_broadcast(message: types.Message, bot: Bot):
    if message.from_user.id != ADMIN_ID:
        return

    command_prefix = "/noti "
    if not message.text.startswith(command_prefix):
        await message.answer("⚠️ Использование: <code>/noti [текст сообщения]</code>", parse_mode="HTML")
        return

    broadcast_text = message.text[len(command_prefix):].strip()
    if not broadcast_text:
        await message.answer("⚠️ Текст рассылки не может быть пустым.")
        return

    status_msg = await message.answer("⏳ Начинаю рассылку... Пожалуйста, подождите.")

    async with aiosqlite.connect("swimming_bot.db") as db:
        async with db.execute("SELECT user_id FROM users") as cursor:
            users = await cursor.fetchall()

    count = 0
    failed_ids = []

    for row in users:
        user_id = row[0]
        try:
            await bot.send_message(user_id, broadcast_text, parse_mode="HTML")
            count += 1
            await asyncio.sleep(0.05)  # Защита от лимитов Telegram (не более 20 сообщений в секунду)
        except Exception:
            failed_ids.append(str(user_id))
            continue

    result_message = f"📢 Рассылка завершена! Отправлено: <b>{count}</b> пользователям"
    
    if failed_ids:
        failed_list = "\n".join(failed_ids)
        # Ограничиваем список ошибок, чтобы сообщение не превысило лимит символов Telegram
        if len(failed_list) > 3000:
            failed_list = failed_list[:3000] + "\n... (список обрезан)"
        result_message += f"\n\n❌ <b>Не получили (заблокировали бота):</b>\n<code>{failed_list}</code>"

    await status_msg.delete()
    await message.answer(result_message, parse_mode="HTML")


# ========== Настройка команд меню ==========
async def set_commands(bot: Bot):
    # Команды для обычных пользователей (только старт)
    user_commands = [
        BotCommand(command="start", description="Запустить RYFT")
    ]
    await bot.set_my_commands(commands=user_commands)

    # Эксклюзивные команды для твоего ID
    admin_commands_list = [
        BotCommand(command="start", description="Запустить RYFT"),
        BotCommand(command="noti", description="Рассылка: /noti [текст]")
    ]
    
    try:
        await bot.set_my_commands(
            commands=admin_commands_list,
            scope=BotCommandScopeChat(chat_id=ADMIN_ID)
        )
    except Exception as e:
        print(f"Не удалось установить админские команды: {e}")