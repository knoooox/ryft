from flask import Flask, request, jsonify, send_file, send_from_directory, abort, redirect
from flask_cors import CORS
import sqlite3
import requests
import base64
import io
import os
import time
from datetime import datetime, timedelta
import smtplib
import random
from email.mime.text import MIMEText
from config import *
import re
import secrets
from PIL import Image
import uuid

app = Flask(__name__)
CORS(app)

DB_PATH = '/root/bot/swimming_bot.db'
DB_DATA_PATH = '/root/bot/swimming_data.db'
GPS_DB_PATH = '/root/bot/gps.db'
BOT_TOKEN = RYFT
ADMIN_ID = "861703506"

# --- ПРОКСИ ДЛЯ ОБХОДА БЛОКИРОВОК РКН ---
PROXY_URL = "http://bCXuqC:eYjBQx@185.168.249.211:8000"
PROXIES = {
    "http": PROXY_URL,
    "https": PROXY_URL
}

# --- НАСТРОЙКИ АВТОРИЗАЦИИ ---
SMTP_SERVER = "smtp.yandex.ru"
SMTP_PORT = 465
SENDER_EMAIL = "ryft.official@yandex.ru"
SENDER_PASSWORD = "scqxtzhfwaovnxsg"


# --- Хелперы для работы с БД ---
def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_gps_db_connection():
    conn = sqlite3.connect(GPS_DB_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def get_data_db_connection():
    conn = sqlite3.connect(DB_DATA_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


# ==========================================
# 1. MIDDLEWARE (Проверки перед запросом)
# ==========================================
@app.before_request
def maintenance_check():
    if request.method == 'OPTIONS':
        return

    public_routes = ['/api/standards', '/api/locations', '/api/profile/get_photo', '/api/auth', '/api/check_sub']
    if any(request.path.startswith(pr) for pr in public_routes):
        return

    if os.path.exists('.maintenance'):
        req_user = None
        try:
            if request.is_json and request.json:
                req_user = request.json.get('admin_id') or request.json.get('user_id') or request.json.get('viewer_id')
            elif request.args:
                req_user = request.args.get('admin_id') or request.args.get('user_id') or request.args.get('viewer_id')
            elif request.view_args:
                req_user = request.view_args.get('user_id')
        except:
            pass

        if str(req_user) == ADMIN_ID:
            return None

        return jsonify({'error': 'maintenance', 'is_maintenance': True}), 503


# ==========================================
# 2. АДМИН-ПАНЕЛЬ (Без изменений)
# ==========================================
@app.route('/api/admin/maintenance', methods=['POST'])
def toggle_maintenance():
    data = request.json
    if str(data.get('admin_id')) != ADMIN_ID: return jsonify({'error': 'Access denied'}), 403
    action = data.get('enable')
    if action:
        open('.maintenance', 'w').close()
    else:
        if os.path.exists('.maintenance'): os.remove('.maintenance')
    return jsonify({'success': True, 'is_maintenance': action})


@app.route('/api/admin/stats', methods=['POST'])
def admin_stats():
    if str(request.json.get('admin_id')) != ADMIN_ID: return jsonify({'error': 'Access denied'}), 403
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) AS count FROM profile_cards")
        total_users = cur.fetchone()['count']
        cur.execute(
            '''SELECT COUNT(*) AS count FROM profile_cards WHERE (region_city != '') OR (school != '') OR (fav_style != '') OR (fav_distance IS NOT NULL)''')
        filled_cards = cur.fetchone()['count']
        cur.execute("SELECT COUNT(*) AS count FROM profile_cards WHERE CAST(is_banned AS TEXT) = '1'")
        banned_users = cur.fetchone()['count']
        return jsonify({'total_users': total_users, 'filled_cards': filled_cards, 'banned_users': banned_users,
                        'is_maintenance': os.path.exists('.maintenance')})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/admin/scan', methods=['POST'])
def admin_scan():
    if str(request.json.get('admin_id')) != ADMIN_ID: return jsonify({'error': 'Access denied'}), 403
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM profile_cards WHERE user_id IS NOT NULL")
        users = [row['user_id'] for row in cur.fetchall()]
    finally:
        conn.close()

    active_count = 0;
    inactive_ids = []
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendChatAction"
    for uid in users:
        try:
            # Внедрен прокси и таймаут, чтобы избежать зависания
            res = requests.post(url, json={'chat_id': uid, 'action': 'typing'}, timeout=3, proxies=PROXIES)
            if res.status_code == 200:
                active_count += 1
            else:
                inactive_ids.append(str(uid))
        except:
            inactive_ids.append(str(uid))
        time.sleep(0.04)
    return jsonify({'active': active_count, 'total': len(users), 'inactive_ids': inactive_ids})


@app.route('/api/admin/search_users', methods=['POST'])
def admin_search_users():
    data = request.json
    if str(data.get('admin_id')) != ADMIN_ID: return jsonify([]), 403
    query = data.get('query', '').strip().lstrip('@')
    banned_only = data.get('banned_only', False)

    conn = get_db_connection()
    conn.create_function("LOWERCASE", 1, lambda s: str(s).lower() if s else "")
    try:
        cursor = conn.cursor()
        search_term = f"%{query.lower()}%"
        base_query = '''
            SELECT u.user_id, u.full_user_name as full_name, u.username, p.photo_file_id as photo_id,
                   CASE WHEN p.is_banned = 1 OR p.is_banned = '1' THEN 1 ELSE 0 END as is_banned
            FROM users u
            LEFT JOIN profile_cards p ON CAST(u.user_id AS TEXT) = CAST(p.user_id AS TEXT)
            WHERE 1=1
        '''
        params = []
        if banned_only: base_query += " AND (p.is_banned = 1 OR p.is_banned = '1')"
        if query:
            base_query += " AND (CAST(u.user_id AS TEXT) = ? OR LOWERCASE(u.full_user_name) LIKE ? OR LOWERCASE(u.username) LIKE ?)"
            params.extend([query, search_term, search_term])
        base_query += " LIMIT 50"
        cursor.execute(base_query, params)
        return jsonify([dict(row) for row in cursor.fetchall()])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/admin/ban', methods=['POST'])
def admin_ban():
    data = request.json
    if str(data.get('admin_id')) != ADMIN_ID: return jsonify({'error': 'Access denied'}), 403
    target = str(data.get('target_user_id', '')).strip()
    action = int(data.get('action', 1))

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id FROM profile_cards WHERE CAST(user_id AS TEXT) = ?", (target,))
        target_val = int(target) if target.isdigit() else target
        if not cur.fetchone():
            cur.execute("INSERT INTO profile_cards (user_id, is_banned) VALUES (?, ?)", (target_val, action))
        else:
            cur.execute("UPDATE profile_cards SET is_banned = ? WHERE CAST(user_id AS TEXT) = ?", (action, target))
        conn.commit()
        return jsonify({'success': 'Статус обновлен'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ==========================================
# 3. ОСНОВНОЙ ПРОФИЛЬ
# ==========================================
@app.route('/api/profile/<int:user_id>', methods=['GET'])
def get_profile(user_id):
    conn_main = get_db_connection()
    try:
        cursor_main = conn_main.cursor()
        cursor_main.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
        user_row = cursor_main.fetchone()

        if not user_row:
            cursor_main.execute('INSERT INTO users (user_id) VALUES (?)', (user_id,))
            conn_main.commit()
            cursor_main.execute('SELECT * FROM users WHERE user_id = ?', (user_id,))
            user_row = cursor_main.fetchone()

        u = dict(user_row)

        cursor_main.execute('SELECT * FROM profile_cards WHERE user_id = ?', (user_id,))
        profile_row = cursor_main.fetchone()
        p = dict(profile_row) if profile_row else {}

        cursor_main.execute('SELECT * FROM premium_settings WHERE user_id = ?', (user_id,))
        prem_row = cursor_main.fetchone()
        prem = dict(prem_row) if prem_row else {}

    except Exception:
        u, p, prem = {}, {}, {}
    finally:
        conn_main.close()

    conn_gps = get_gps_db_connection()
    try:
        cursor_gps = conn_gps.cursor()
        cursor_gps.execute('SELECT career_start_date FROM coaches WHERE user_id = ?', (user_id,))
        c_row = cursor_gps.fetchone()
        career_start = c_row['career_start_date'] if c_row else None

        cursor_gps.execute('SELECT COUNT(*) FROM coach_athletes WHERE coach_id = ?', (user_id,))
        athletes_count = cursor_gps.fetchone()[0]
        is_coach = bool(career_start) or (athletes_count > 0)
    except:
        career_start, athletes_count, is_coach = None, 0, False
    finally:
        conn_gps.close()

    return jsonify({
        'full_name': u.get('full_user_name') or "",
        'username': u.get('username') or "",
        'gender': u.get('gender') or "",
        'is_gps_hidden': bool(u.get('is_gps_hidden', 0)),
        'is_records_hidden': bool(u.get('is_records_hidden', 0)),
        'wheel_style': u.get('wheel_style', 'horizontal'),

        'photo_id': p.get('photo_file_id'),  
        'birthdate': p.get('birthdate') or "",
        'city': p.get('region_city') or "",
        'school': p.get('school') or "",
        'coach': p.get('coach') or "",
        'rank': p.get('rank') or "",
        'style': p.get('fav_style') or "",
        'distance': p.get('fav_distance') or "",
        'is_banned': str(p.get('is_banned', '0')) == '1',

        'is_coach': is_coach,
        'career_start_date': career_start,
        'athletes_count': athletes_count,

        'is_premium': bool(u.get('is_premium', 0)),
        'bio': prem.get('bio') or "",
        'vk_link': prem.get('vk_link') or "",
        'tg_link': prem.get('tg_link') or "",
        'inst_link': prem.get('inst_link') or "",
        'tiktok_link': prem.get('tiktok_link') or ""
    })


@app.route('/api/profile/set_gender', methods=['POST'])
def set_gender():
    data = request.json
    user_id = data.get('user_id')
    if not user_id or not data.get('gender'): return jsonify({'error': 'Missing data'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT user_id FROM users WHERE user_id = ?', (user_id,))
        if not cursor.fetchone():
            cursor.execute('INSERT INTO users (user_id, full_user_name, username, gender) VALUES (?, ?, ?, ?)',
                           (user_id, data.get('full_name', ''), data.get('username', ''), data.get('gender')))
        else:
            cursor.execute('''UPDATE users SET gender = ?, full_user_name = COALESCE(NULLIF(full_user_name, ""), ?), 
                              username = COALESCE(NULLIF(username, ""), ?) WHERE user_id = ?''',
                           (data.get('gender'), data.get('full_name', ''), data.get('username', ''), user_id))

        cursor.execute('INSERT OR IGNORE INTO profile_cards (user_id) VALUES (?)', (user_id,))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/profile/save', methods=['POST'])
def save_profile():
    data = request.json
    user_id = data.get('user_id')
    if not user_id: return jsonify({'error': 'No user_id provided'}), 400
    fav_distance = int(data.get('distance')) if str(data.get('distance')).isdigit() else None

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('INSERT OR IGNORE INTO users (user_id, full_user_name, username) VALUES (?, ?, ?)',
                       (user_id, data.get('full_name', ''), data.get('username', '')))

        if data.get('full_name'):
            cursor.execute('UPDATE users SET full_user_name = ?, username = ? WHERE user_id = ?',
                           (data.get('full_name'), data.get('username'), user_id))

        cursor.execute('SELECT user_id FROM profile_cards WHERE user_id = ?', (user_id,))
        if cursor.fetchone():
            cursor.execute(
                '''UPDATE profile_cards SET birthdate=?, region_city=?, school=?, coach=?, rank=?, fav_style=?, fav_distance=? WHERE user_id=?''',
                (data.get('birthdate', ''), data.get('city', ''), data.get('school', ''), data.get('coach', ''),
                 data.get('rank', ''), data.get('style', ''), fav_distance, user_id))
        else:
            cursor.execute(
                '''INSERT INTO profile_cards (user_id, birthdate, region_city, school, coach, rank, fav_style, fav_distance) VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
                (user_id, data.get('birthdate', ''), data.get('city', ''), data.get('school', ''),
                 data.get('coach', ''), data.get('rank', ''), data.get('style', ''), fav_distance))

        city_val = data.get('city', '').strip()
        school_val = data.get('school', '').strip()
        if city_val:
            cursor.execute('INSERT OR IGNORE INTO locations (city, school) VALUES (?, ?)', (city_val, school_val))

        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/premium/save', methods=['POST'])
def save_premium():
    data = request.json
    user_id = data.get('user_id')
    if not user_id: return jsonify({'error': 'No user_id'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT user_id FROM premium_settings WHERE user_id = ?', (user_id,))
        if not cursor.fetchone():
            cursor.execute(
                'INSERT INTO premium_settings (user_id, bio, vk_link, tg_link, inst_link, tiktok_link) VALUES (?, ?, ?, ?, ?, ?)',
                (user_id, data.get('bio', ''), data.get('vk_link', ''), data.get('tg_link', ''),
                 data.get('inst_link', ''), data.get('tiktok_link', '')))
        else:
            cursor.execute(
                'UPDATE premium_settings SET bio = ?, vk_link = ?, tg_link = ?, inst_link = ?, tiktok_link = ? WHERE user_id = ?',
                (data.get('bio', ''), data.get('vk_link', ''), data.get('tg_link', ''), data.get('inst_link', ''),
                 data.get('tiktok_link', ''), user_id))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ==========================================
# 5. РАБОТА С ФОТОГРАФИЯМИ И ПОИСК (С ПРОКСИ)
# ==========================================
@app.route('/api/profile/get_photo/<file_id>', methods=['GET'])
def get_photo(file_id):
    if not file_id or file_id == 'null':
        return abort(404)

    try:
        file_info_url = f"https://api.telegram.org/bot{BOT_TOKEN}/getFile?file_id={file_id}"
        res = requests.get(file_info_url, proxies=PROXIES, timeout=5).json()

        if not res.get("ok"):
            return abort(404)

        file_path = res["result"]["file_path"]
        download_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
        img_res = requests.get(download_url, proxies=PROXIES, timeout=10)

        if img_res.status_code != 200:
            return abort(404)

        return send_file(
            io.BytesIO(img_res.content),
            mimetype='image/jpeg'
        )
    except Exception as e:
        print(f"Ошибка загрузки фото: {e}")
        return abort(500)


@app.route('/api/profile/upload_photo', methods=['POST'])
def upload_photo():
    data = request.json
    user_id = data.get('user_id')
    image_data_base64 = data.get('image')

    if not user_id:
        return jsonify({'error': 'Missing user_id'}), 400

    conn = get_db_connection()
    cursor = conn.cursor()

    if not image_data_base64:
        try:
            cursor.execute('UPDATE profile_cards SET photo_file_id = NULL WHERE user_id = ?', (user_id,))
            conn.commit()
            return jsonify({'status': 'success'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
        finally:
            conn.close()

    try:
        if "," in image_data_base64:
            image_data_base64 = image_data_base64.split(",")[1]

        img_data = base64.b64decode(image_data_base64)
        tg_url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendPhoto"
        files = {'photo': ('avatar.jpg', img_data, 'image/jpeg')}
        payload = {'chat_id': ADMIN_ID, 'disable_notification': True}

        r = requests.post(tg_url, data=payload, files=files, proxies=PROXIES, timeout=10).json()

        if not r.get('ok'):
            raise Exception("Ошибка загрузки на сервера Telegram")

        new_file_id = r['result']['photo'][-1]['file_id']

        cursor.execute('SELECT user_id FROM profile_cards WHERE user_id = ?', (user_id,))
        if cursor.fetchone():
            cursor.execute('UPDATE profile_cards SET photo_file_id = ? WHERE user_id = ?', (new_file_id, user_id))
        else:
            cursor.execute('INSERT INTO profile_cards (user_id, photo_file_id) VALUES (?, ?)', (user_id, new_file_id))
        conn.commit()

        return jsonify({'status': 'success', 'file_id': new_file_id})
    except Exception as e:
        print(f"Upload photo error: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/profile/search', methods=['GET'])
def search_users():
    query = request.args.get('q', '').strip().lstrip('@')
    if not query: return jsonify([])

    conn = get_db_connection()
    conn.create_function("LOWERCASE", 1, lambda s: str(s).lower() if s else "")

    try:
        cursor = conn.cursor()
        search_term = f"%{query.lower()}%"

        if query.isdigit():
            cursor.execute('''
                            SELECT u.user_id, u.full_user_name as full_name, u.username, p.photo_file_id as photo_file_id 
                            FROM users u LEFT JOIN profile_cards p ON u.user_id = p.user_id
                            WHERE (CAST(u.user_id AS TEXT) = ? OR LOWERCASE(u.full_user_name) LIKE ? OR LOWERCASE(u.username) LIKE ?)
                              AND (p.is_banned IS NULL OR CAST(p.is_banned AS TEXT) != '1') LIMIT 30
                        ''', (query, search_term, search_term))
        else:
            cursor.execute('''
                            SELECT u.user_id, u.full_user_name as full_name, u.username, p.photo_file_id as photo_file_id 
                            FROM users u LEFT JOIN profile_cards p ON u.user_id = p.user_id
                            WHERE (LOWERCASE(u.full_user_name) LIKE ? OR LOWERCASE(u.username) LIKE ?)
                              AND (p.is_banned IS NULL OR CAST(p.is_banned AS TEXT) != '1') LIMIT 30
                        ''', (search_term, search_term))

        return jsonify([dict(row) for row in cursor.fetchall()])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ==========================================
# 6. РЕКОРДЫ, НАСТРОЙКИ И НОРМАТИВЫ
# ==========================================
@app.route('/api/records/<int:user_id>', methods=['GET'])
def get_user_records(user_id):
    viewer_id = request.args.get('viewer_id', type=int)
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT is_records_hidden FROM users WHERE user_id = ?', (user_id,))
        u = cursor.fetchone()
        is_hidden = bool(u['is_records_hidden']) if u else False

        if viewer_id and str(viewer_id) != str(user_id) and is_hidden:
            conn_gps = get_gps_db_connection()
            c_gps = conn_gps.cursor()
            c_gps.execute('SELECT 1 FROM coach_athletes WHERE coach_id = ? AND athlete_id = ?', (viewer_id, user_id))
            is_his_coach = bool(c_gps.fetchone())
            conn_gps.close()
            if not is_his_coach: return jsonify({'status': 'hidden'})

        cursor.execute('SELECT pool, style, distance, best_time, last_time, date_best FROM records WHERE user_id = ?',
                       (user_id,))
        return jsonify([dict(r) for r in cursor.fetchall()])
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/records/save', methods=['POST'])
def save_user_record():
    data = request.json
    user_id = data.get('user_id');
    pool = data.get('pool')
    style = data.get('style');
    distance = data.get('distance')
    new_time = float(data.get('time', 0))
    date_str = data.get('date') or datetime.now().strftime("%d.%m.%Y")
    date_only = data.get('date_only', False)

    if not all([user_id, pool, style, distance]): return jsonify({'error': 'Missing data'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        if date_only:
            cursor.execute('UPDATE records SET date_best=? WHERE user_id=? AND pool=? AND style=? AND distance=?',
                           (date_str, user_id, pool, style, distance))
            conn.commit()
            return jsonify({'status': 'success', 'is_new_best': False})

        cursor.execute('SELECT best_time FROM records WHERE user_id=? AND pool=? AND style=? AND distance=?',
                       (user_id, pool, style, distance))
        row = cursor.fetchone()

        is_new_best = False
        if not row:
            is_new_best = True
            cursor.execute(
                'INSERT INTO records (user_id, pool, style, distance, best_time, last_time, date_best) VALUES (?, ?, ?, ?, ?, ?, ?)',
                (user_id, pool, style, distance, new_time, new_time, date_str))
        else:
            if new_time < row['best_time']:
                is_new_best = True
                cursor.execute(
                    'UPDATE records SET best_time=?, last_time=?, date_best=? WHERE user_id=? AND pool=? AND style=? AND distance=?',
                    (new_time, new_time, date_str, user_id, pool, style, distance))
            else:
                cursor.execute('UPDATE records SET last_time=? WHERE user_id=? AND pool=? AND style=? AND distance=?',
                               (new_time, user_id, pool, style, distance))

        conn.commit()
        return jsonify({'status': 'success', 'is_new_best': is_new_best})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/records/delete', methods=['POST'])
def delete_user_record():
    data = request.json
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM records WHERE user_id=? AND pool=? AND style=? AND distance=?',
                       (data.get('user_id'), data.get('pool'), data.get('style'), data.get('distance')))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/settings/update', methods=['POST'])
def update_settings():
    data = request.json
    if not data.get('user_id'): return jsonify({'error': 'Missing user_id'}), 400
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            '''UPDATE users SET is_gps_hidden = ?, is_records_hidden = ?, wheel_style = ? WHERE user_id = ?''',
            (1 if data.get('is_gps_hidden') else 0, 1 if data.get('is_records_hidden') else 0,
             data.get('wheel_style', 'horizontal'), data.get('user_id')))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        conn.rollback()
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/standards', methods=['GET'])
def get_standards():
    conn = get_data_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM swimming_standards")
        db_dict = {}
        for r in cursor.fetchall():
            g = r['gender'];
            p = str(r['pool']);
            s = r['style'];
            d = str(r['distance'])
            if g not in db_dict: db_dict[g] = {}
            if p not in db_dict[g]: db_dict[g][p] = {}
            if s not in db_dict[g][p]: db_dict[g][p][s] = {}
            db_dict[g][p][s][d] = {
                "rec": r["record_time"], "msmk": r["MSMK"], "ms": r["MS"], "kms": r["KMS"],
                "i": r["I"], "ii": r["II"], "iii": r["III"], "i_j": r["I_jun"], "ii_j": r["II_jun"],
                "iii_j": r["III_jun"]
            }
        return jsonify(db_dict)
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ==========================================
# 7. ТРЕНЕРЫ И ГПС
# ==========================================
@app.route('/api/gps/<int:user_id>', methods=['GET'])
def get_user_gps(user_id):
    viewer_id = request.args.get('viewer_id', type=int)
    bot_conn = get_db_connection()
    is_hidden = False
    try:
        bot_cur = bot_conn.cursor()
        bot_cur.execute('SELECT is_gps_hidden FROM users WHERE user_id = ?', (user_id,))
        u = bot_cur.fetchone()
        if u and dict(u).get('is_gps_hidden', 0) == 1: is_hidden = True
    except:
        pass
    finally:
        bot_conn.close()

    if str(viewer_id) != str(user_id) and is_hidden:
        conn_gps = get_gps_db_connection()
        cur_gps = conn_gps.cursor()
        cur_gps.execute('SELECT 1 FROM coach_athletes WHERE coach_id = ? AND athlete_id = ?', (viewer_id, user_id))
        is_his_coach = bool(cur_gps.fetchone())
        conn_gps.close()
        if not is_his_coach: return jsonify({'status': 'hidden'})

    conn = get_gps_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM gps_profiles WHERE user_id = ?', (user_id,))
        profile_row = cursor.fetchone()
        if not profile_row: return jsonify({'status': 'empty'})

        cursor.execute('SELECT distance, pulse_zone, time FROM gps_times WHERE user_id = ?', (user_id,))
        times_data = {}
        for row in cursor.fetchall():
            dist = str(row['distance'])
            if dist not in times_data: times_data[dist] = []
            times_data[dist].append({'zone': row['pulse_zone'], 'time': row['time']})

        return jsonify({'status': 'success', 'profile': dict(profile_row), 'times': times_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/coach/link', methods=['POST'])
def link_coach():
    data = request.json
    if not data.get('athlete_id') or not data.get('coach_id'): return jsonify({'error': 'Некорректные данные'}), 400
    conn = get_gps_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('INSERT OR IGNORE INTO coach_athletes (coach_id, athlete_id) VALUES (?, ?)',
                       (data.get('coach_id'), data.get('athlete_id')))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/coach/save_profile', methods=['POST'])
def save_coach_profile():
    data = request.json
    user_id = data.get('user_id')
    if not user_id: return jsonify({'error': 'No user_id'}), 400
    conn = get_gps_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT user_id FROM coaches WHERE user_id = ?', (user_id,))
        if cursor.fetchone():
            cursor.execute('UPDATE coaches SET career_start_date = ? WHERE user_id = ?',
                           (data.get('career_start_date'), user_id))
        else:
            cursor.execute('INSERT INTO coaches (user_id, career_start_date) VALUES (?, ?)',
                           (user_id, data.get('career_start_date')))
        conn.commit()
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/coach/athletes/<int:coach_id>', methods=['GET'])
def get_coach_athletes(coach_id):
    conn_gps = get_gps_db_connection()
    athletes_data = []
    try:
        cursor_gps = conn_gps.cursor()
        cursor_gps.execute('SELECT athlete_id FROM coach_athletes WHERE coach_id = ?', (coach_id,))
        athletes_data = [{'athlete_id': r['athlete_id']} for r in cursor_gps.fetchall()]
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn_gps.close()

    if not athletes_data: return jsonify({'status': 'success', 'athletes': []})

    athlete_ids = [str(a['athlete_id']) for a in athletes_data]
    placeholders = ','.join('?' for _ in athlete_ids)

    conn_main = get_db_connection()
    try:
        cursor_main = conn_main.cursor()
        cursor_main.execute(f'''
                    SELECT u.user_id, u.full_user_name, u.username, p.photo_file_id as photo_file_id 
                    FROM users u LEFT JOIN profile_cards p ON u.user_id = p.user_id
                    WHERE u.user_id IN ({placeholders})
                ''', athlete_ids)

        user_info_map = {row['user_id']: row for row in cursor_main.fetchall()}

        for ath in athletes_data:
            info = user_info_map.get(ath['athlete_id'])
            if info:
                ath['athlete_name'] = info['full_user_name'] or 'Спортсмен'
                ath['username'] = info['username']
                ath['photo_id'] = info['photo_file_id']

        return jsonify({'status': 'success', 'athletes': athletes_data})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn_main.close()


@app.route('/api/locations', methods=['GET'])
def get_locations():
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute('SELECT city, school FROM locations')
        data = {}
        for r in cur.fetchall():
            city = r['city'].strip() if r['city'] else ""
            school = r['school'].strip() if r['school'] else ""
            if not city: continue
            if city not in data: data[city] = []
            if school and school not in data[city]: data[city].append(school)
        for city in data: data[city].sort()
        return jsonify(data)
    except Exception:
        return jsonify({}), 500
    finally:
        conn.close()


@app.route('/api/profile/set_link', methods=['POST'])
def set_custom_link():
    data = request.json
    user_id = data.get('user_id')
    new_link = str(data.get('custom_link', '')).strip().lower()

    if not user_id: return jsonify({'error': 'No user_id'}), 400

    if len(new_link) < 4 or len(new_link) > 20:
        return jsonify({'error': 'Ссылка должна быть от 4 до 20 символов'}), 400
    if not re.match(r'^[a-z0-9_]+$', new_link):
        return jsonify({'error': 'Только латинские буквы, цифры и подчеркивание'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT user_id FROM users WHERE custom_link = ? AND user_id != ?", (new_link, user_id))
        if cursor.fetchone():
            return jsonify({'error': 'Эта ссылка уже занята 😔'}), 400

        cursor.execute("UPDATE users SET custom_link = ? WHERE user_id = ?", (new_link, user_id))
        conn.commit()
        return jsonify({'status': 'success', 'link': new_link})
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        conn.close()


# ==========================================
# 4. ПРОВЕРКА ПОДПИСКИ (С КЭШЕМ И ПРОКСИ)
# ==========================================

# Создаем словарь для кэширования в памяти: { internal_id: (timestamp_проверки, статус_подписки) }
SUB_CACHE = {}
CACHE_LIFETIME = 3600 * 12  # Кэшируем результат на 12 часов


@app.route('/api/check_sub/<int:internal_id>', methods=['GET'])
def check_sub(internal_id):
    # 1. ПРОВЕРЯЕМ КЭШ (МОМЕНТАЛЬНЫЙ ОТВЕТ)
    if internal_id in SUB_CACHE:
        cached_time, is_subscribed = SUB_CACHE[internal_id]
        if time.time() - cached_time < CACHE_LIFETIME:
            return jsonify({'subscribed': is_subscribed})

    # 2. ЕСЛИ В КЭШЕ НЕТ, ИДЕМ В БАЗУ И ТЕЛЕГРАМ
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT tg_id FROM users WHERE user_id = ?", (internal_id,))
        row = cur.fetchone()

        if not row or not row['tg_id']:
            SUB_CACHE[internal_id] = (time.time(), True)
            return jsonify({'subscribed': True})

        tg_id = row['tg_id']
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/getChatMember?chat_id={CHANNEL_ID}&user_id={tg_id}"

        # Запрос через прокси (ждем максимум 2 секунды, чтобы не вешать сервер)
        response = requests.get(url, proxies=PROXIES, timeout=2).json()

        if response.get('ok'):
            status = response['result']['status']
            if status in ['creator', 'administrator', 'member', 'restricted']:
                SUB_CACHE[internal_id] = (time.time(), True)
                return jsonify({'subscribed': True})

        # Если не подписан, кэшируем на короткое время (чтобы не спамить запросами, пока он подписывается)
        SUB_CACHE[internal_id] = (time.time(), False)
        return jsonify({'subscribed': False})

    except Exception as e:
        # ЕСЛИ ПРОКСИ УПАЛ - ПУСКАЕМ ЮЗЕРА ДАЛЬШЕ (сохраняем в кэш на 1 час)
        print(f"Ошибка проверки подписки (прокси мертв?): {e}")
        SUB_CACHE[internal_id] = (time.time(), True)
        return jsonify({'subscribed': True})
    finally:
        conn.close()


# ==========================================
# 10. УМНЫЙ РЕДИРЕКТ КАСТОМНЫХ ССЫЛОК
# ==========================================
@app.route('/<short_link>')
def redirect_short_link(short_link):
    if short_link in ['api', 'static', 'favicon.ico']: return abort(404)

    conn = get_db_connection()
    conn.create_function("LOWERCASE", 1, lambda s: str(s).lower() if s else "")
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT user_id FROM users WHERE custom_link = ? OR LOWERCASE(username) = ? OR CAST(user_id AS TEXT) = ?",
            (short_link.lower(), short_link.lower(), short_link))
        user = cursor.fetchone()
        if user:
            return redirect(f"https://app.ryft-official.ru/?user={user['user_id']}")
        else:
            return "Спортсмен не найден :(", 404
    finally:
        conn.close()


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000)
