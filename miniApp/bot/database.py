import aiosqlite

async def init_db():
    # ========== ОСНОВНАЯ БАЗА ДАННЫХ (swimming_bot.db) ==========
    async with aiosqlite.connect("swimming_bot.db") as db:

        # 1. Таблица locations
        await db.execute("""
            CREATE TABLE IF NOT EXISTS locations (
                id     INTEGER PRIMARY KEY AUTOINCREMENT,
                city   TEXT,
                school TEXT
            )""")

        # 2. Таблица premium_settings
        await db.execute("""
            CREATE TABLE IF NOT EXISTS premium_settings (
                user_id     INTEGER PRIMARY KEY,
                bio         TEXT,
                vk_link     TEXT,
                tg_link     TEXT,
                inst_link   TEXT,
                tiktok_link TEXT
            )""")

        # 3. Таблица profile_cards
        await db.execute("""
            CREATE TABLE IF NOT EXISTS profile_cards (
                user_id       INTEGER PRIMARY KEY,
                photo_file_id TEXT,
                birthdate     TEXT,
                region_city   TEXT,
                school        TEXT,
                coach         TEXT,
                rank          TEXT,
                fav_style     TEXT,
                fav_distance  INTEGER,
                is_banned     INTEGER DEFAULT 0
            )""")

        # 4. Таблица records
        await db.execute("""
            CREATE TABLE IF NOT EXISTS records (
                user_id   INTEGER,
                pool      TEXT,
                style     TEXT,
                distance  INTEGER,
                best_time REAL,
                last_time REAL,
                date_best TEXT,
                PRIMARY KEY (user_id, pool, style, distance)
            )""")

        # 5. Идеально чистая таблица users
        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                user_id           INTEGER  PRIMARY KEY,
                gender            TEXT,
                full_user_name    TEXT,
                username          TEXT,
                is_gps_hidden     INTEGER  DEFAULT 0,
                is_records_hidden INTEGER  DEFAULT 0,
                wheel_style       TEXT     DEFAULT 'horizontal',
                is_premium        INTEGER  DEFAULT 0,
                custom_link       TEXT
            )""")

        # Оставляем только те авто-миграции, которые относятся к "выжившим" колонкам
        columns_to_add = [
            ("users", "username TEXT"),
            ("users", "is_gps_hidden INTEGER DEFAULT 0"),
            ("users", "is_records_hidden INTEGER DEFAULT 0"),
            ("users", "wheel_style TEXT DEFAULT 'horizontal'"),
            ("users", "is_premium INTEGER DEFAULT 0"),
            ("users", "custom_link TEXT"),
            ("profile_cards", "fav_distance INTEGER"),
            ("profile_cards", "is_banned INTEGER DEFAULT 0")
        ]

        for table, col_def in columns_to_add:
            try:
                await db.execute(f"ALTER TABLE {table} ADD COLUMN {col_def}")
            except aiosqlite.OperationalError:
                pass

        await db.commit()

    # ========== БАЗА ДАННЫХ GPS И ТРЕНЕРОВ (gps.db) ==========
    async with aiosqlite.connect("gps.db") as db:
        await db.execute(
            "CREATE TABLE IF NOT EXISTS coach_athletes (coach_id INTEGER, athlete_id INTEGER, PRIMARY KEY (coach_id, athlete_id))"
        )
        await db.execute(
            "CREATE TABLE IF NOT EXISTS gps_profiles (user_id INTEGER PRIMARY KEY, full_name TEXT, best_50 TEXT, current_200 TEXT, target_200 TEXT, current_gps REAL, target_gps REAL)"
        )
        await db.execute(
            "CREATE TABLE IF NOT EXISTS gps_times (user_id INTEGER, distance INTEGER, pulse_zone TEXT, time TEXT, PRIMARY KEY (user_id, distance, pulse_zone))"
        )
        await db.execute(
            "CREATE TABLE IF NOT EXISTS coaches (user_id INTEGER PRIMARY KEY, career_start_date TEXT)"
        )
        await db.commit()

    # ========== БАЗА ДАННЫХ НОРМАТИВОВ (swimming_data.db) ==========
    async with aiosqlite.connect("swimming_data.db") as db:
        await db.execute(
            "CREATE TABLE IF NOT EXISTS swimming_standards (gender TEXT, pool TEXT, style TEXT, distance INTEGER, record_time REAL, MSMK REAL, MS REAL, KMS REAL, I REAL, II REAL, III REAL, I_jun REAL, II_jun REAL, III_jun REAL, PRIMARY KEY (gender, pool, style, distance))"
        )
        await db.commit()