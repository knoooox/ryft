import aiosqlite

async def init_db():
    # ========== ОСНОВНАЯ БАЗА ДАННЫХ (swimming_bot.db) ==========
    async with aiosqlite.connect("swimming_bot.db") as db:

        # 1. Создание таблицы пользователей (обновленная независимая схема)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id           INTEGER PRIMARY KEY AUTOINCREMENT, 
                tg_id             INTEGER UNIQUE,
                email             TEXT UNIQUE DEFAULT NULL,
                gender            TEXT, 
                full_user_name    TEXT,
                username          TEXT,
                photo_filename    TEXT DEFAULT NULL,
                is_gps_hidden     INTEGER DEFAULT 0,
                is_records_hidden INTEGER DEFAULT 0,
                wheel_style       TEXT DEFAULT 'horizontal',
                is_premium        INTEGER DEFAULT 0,
                custom_link       TEXT UNIQUE,
                auth_code         TEXT DEFAULT NULL,
                auth_code_expires DATETIME DEFAULT NULL
            )""")

        # 2. Создание таблицы сессий (для поддержки мультиаккаунтов и входа из браузера)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id       INTEGER NOT NULL,
                session_token TEXT UNIQUE NOT NULL,
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at    DATETIME NOT NULL,
                device_info   TEXT,
                ip_address    TEXT,
                FOREIGN KEY(user_id) REFERENCES users(user_id) ON DELETE CASCADE
            )""")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS records (
                user_id INTEGER, pool TEXT, style TEXT, distance INTEGER, 
                best_time REAL, last_time REAL, date_best TEXT, 
                PRIMARY KEY (user_id, pool, style, distance)
            )""")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS profile_cards (
                user_id INTEGER PRIMARY KEY, 
                photo_file_id TEXT, 
                birthdate TEXT,
                region_city TEXT, 
                school TEXT, 
                coach TEXT, 
                rank TEXT,
                fav_style TEXT, 
                fav_distance INTEGER, 
                is_banned INTEGER DEFAULT 0
            )""")

        # Таблица для ПРЕМИУМ-настроек
        await db.execute("""
            CREATE TABLE IF NOT EXISTS premium_settings (
                user_id INTEGER PRIMARY KEY,
                bio TEXT,
                vk_link TEXT,
                tg_link TEXT,
                inst_link TEXT,
                tiktok_link TEXT
            )""")

        # 3. Безопасное добавление колонок для старых баз (Авто-миграции)
        # Если база уже была, SQLite аккуратно добавит новые поля
        columns_to_add = [
            ("users", "tg_id INTEGER UNIQUE"),
            ("users", "email TEXT UNIQUE DEFAULT NULL"),
            ("users", "username TEXT"),
            ("users", "photo_filename TEXT DEFAULT NULL"),
            ("users", "is_gps_hidden INTEGER DEFAULT 0"),
            ("users", "is_records_hidden INTEGER DEFAULT 0"),
            ("users", "wheel_style TEXT DEFAULT 'horizontal'"),
            ("users", "is_premium INTEGER DEFAULT 0"),
            ("users", "custom_link TEXT"),
            ("users", "auth_code TEXT DEFAULT NULL"),
            ("users", "auth_code_expires DATETIME DEFAULT NULL"),
            ("profile_cards", "fav_distance INTEGER"),
            ("profile_cards", "is_banned INTEGER DEFAULT 0")
        ]

        for table, col_def in columns_to_add:
            try:
                await db.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
            except aiosqlite.OperationalError:
                pass # Колонка уже существует, пропускаем

        await db.commit()

    # Остальные базы оставляем без изменений
    async with aiosqlite.connect("gps.db") as db:
        await db.execute(
            "CREATE TABLE IF NOT EXISTS coach_athletes (coach_id INTEGER, athlete_id INTEGER, PRIMARY KEY (coach_id, athlete_id))")
        await db.execute(
            "CREATE TABLE IF NOT EXISTS gps_profiles (user_id INTEGER PRIMARY KEY, full_name TEXT, best_50 TEXT, current_200 TEXT, target_200 TEXT, current_gps REAL, target_gps REAL)")
        await db.execute(
            "CREATE TABLE IF NOT EXISTS gps_times (user_id INTEGER, distance INTEGER, pulse_zone TEXT, time TEXT, PRIMARY KEY (user_id, distance, pulse_zone))")
        await db.commit()

    async with aiosqlite.connect("swimming_data.db") as db:
        await db.execute(
            "CREATE TABLE IF NOT EXISTS swimming_standards (gender TEXT, pool TEXT, style TEXT, distance INTEGER, record_time REAL, MSMK REAL, MS REAL, KMS REAL, I REAL, II REAL, III REAL, I_jun REAL, II_jun REAL, III_jun REAL, PRIMARY KEY (gender, pool, style, distance))")
        await db.commit()