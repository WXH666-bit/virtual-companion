"""FastAPI app entry point."""
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db.database import engine, Base
from routes import chat, skills, auth

# Create tables
Base.metadata.create_all(bind=engine)

# ── Database migrations ──
with engine.connect() as conn:
    # --- Messages table ---
    msg_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(messages)")]
    for col, col_type in [("sticker_url", "TEXT"), ("sticker_emoji", "TEXT"),
                           ("img_desc", "TEXT")]:
        if col not in msg_cols:
            conn.exec_driver_sql(f"ALTER TABLE messages ADD COLUMN {col} {col_type}")

    # --- Conversations table ---
    conv_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(conversations)")]
    if "user_id" not in conv_cols:
        conn.exec_driver_sql("ALTER TABLE conversations ADD COLUMN user_id INTEGER REFERENCES users(id)")

    # --- Settings table: migrate from key PK to id PK + unique(key, user_id) ---
    set_cols = [row[1] for row in conn.exec_driver_sql("PRAGMA table_info(settings)")]
    if "id" not in set_cols:
        # Old schema: key is PK, no id column. Rebuild table.
        print("[Migration] 重建 settings 表以支持多用户…")
        # 1. Create new table
        conn.exec_driver_sql("""
            CREATE TABLE settings_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key VARCHAR(100) NOT NULL,
                value TEXT DEFAULT '',
                user_id INTEGER REFERENCES users(id),
                UNIQUE(key, user_id)
            )
        """)
        # 2. Copy existing data (add user_id if column exists)
        if "user_id" in set_cols:
            conn.exec_driver_sql("""
                INSERT INTO settings_new (key, value, user_id)
                SELECT key, value, user_id FROM settings
            """)
        else:
            conn.exec_driver_sql("""
                INSERT INTO settings_new (key, value) SELECT key, value FROM settings
            """)
        # 3. Drop old table and rename new one
        conn.exec_driver_sql("DROP TABLE settings")
        conn.exec_driver_sql("ALTER TABLE settings_new RENAME TO settings")
        print("[Migration] settings 表重建完成")
    elif "user_id" not in set_cols:
        conn.exec_driver_sql("ALTER TABLE settings ADD COLUMN user_id INTEGER REFERENCES users(id)")

    conn.commit()

# ── Ensure default admin user exists (for migration of old data) ──
from db.database import SessionLocal
db = SessionLocal()
try:
    from db.models import User, Conversation, Setting
    from services.auth import hash_password

    existing = db.query(User).filter(User.username == "admin").first()
    if not existing:
        admin = User(username="admin", password_hash=hash_password("admin"))
        db.add(admin)
        db.flush()

        # Assign all orphan conversations to admin
        orphan_conv = db.query(Conversation).filter(Conversation.user_id.is_(None)).all()
        for c in orphan_conv:
            c.user_id = admin.id

        # Assign all orphan settings to admin
        orphan_set = db.query(Setting).filter(Setting.user_id.is_(None)).all()
        for s in orphan_set:
            s.user_id = admin.id

        db.commit()
        print("[Migration] 已创建默认 admin 用户 (admin/admin)，请尽快修改密码")
    else:
        # Still fix any orphan records
        orphan_conv = db.query(Conversation).filter(Conversation.user_id.is_(None)).all()
        if orphan_conv:
            for c in orphan_conv:
                c.user_id = existing.id
        orphan_set = db.query(Setting).filter(Setting.user_id.is_(None)).all()
        if orphan_set:
            for s in orphan_set:
                s.user_id = existing.id
        if orphan_conv or orphan_set:
            db.commit()
finally:
    db.close()

# ── App setup ──

AVATARS_DIR = Path(__file__).parent / "avatars"
AVATARS_DIR.mkdir(exist_ok=True)

app = FastAPI(title="Virtual Companion")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/avatars", StaticFiles(directory=str(AVATARS_DIR)), name="avatars")

app.include_router(auth.router)
app.include_router(chat.router)
app.include_router(skills.router)


@app.on_event("startup")
def startup():
    """Preload sticker index in background."""
    import threading
    def _load():
        try:
            from services.sticker import preload_index
            preload_index()
        except Exception:
            pass
    threading.Thread(target=_load, daemon=True).start()


@app.get("/")
def root():
    return {"message": "Virtual Companion API is running"}
