"""一键启动前后端。

本地模式（仅本机访问）：
    python start.py

局域网模式（同网络其他人可访问）：
    python start.py --lan
"""
import subprocess
import sys
import time
import webbrowser
import signal
import os
import socket
from pathlib import Path

ROOT = Path(__file__).parent
SERVER_DIR = ROOT / "server"
CLIENT_DIR = ROOT / "client"

backend = None
frontend = None
LAN_MODE = "--lan" in sys.argv


def get_lan_ip() -> str:
    """Get the primary LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def cleanup():
    """Kill both subprocesses."""
    for proc in [backend, frontend]:
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
    print("\n👋 已关闭")


def kill_port(port: int):
    """Free a port by killing whatever process is using it (Windows only)."""
    if sys.platform != "win32":
        return
    try:
        import subprocess as sp
        result = sp.run(
            ["netstat", "-ano", "-p", "TCP"],
            capture_output=True, text=True,
        )
        for line in result.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                parts = line.split()
                pid = parts[-1]
                sp.run(["taskkill", "/F", "/PID", pid],
                       capture_output=True)
                print(f"   🔄 端口 {port} 被占用，已释放 (PID {pid})")
                time.sleep(1)
    except Exception:
        pass


def signal_handler(sig, frame):
    cleanup()
    sys.exit(0)


def find_npm():
    """Find npm executable, adding common paths to PATH if needed."""
    # Common Node.js install locations on Windows
    extra_paths = [
        r"D:\nodejs",
        r"C:\Program Files\nodejs",
        r"C:\Program Files (x86)\nodejs",
        os.path.expanduser(r"~\AppData\Roaming\npm"),
        os.path.expanduser(r"~\AppData\Local\Programs\nodejs"),
    ]
    for p in extra_paths:
        if p not in os.environ.get("PATH", "") and os.path.isdir(p):
            os.environ["PATH"] = p + ";" + os.environ.get("PATH", "")

    # On Windows, npm is npm.cmd, not npm.exe
    extensions = [".cmd", ".exe", ""] if sys.platform == "win32" else [""]

    npm_path = None
    for d in os.environ.get("PATH", "").split(";"):
        for ext in extensions:
            candidate = os.path.join(d, "npm" + ext)
            if os.path.isfile(candidate):
                npm_path = candidate
                break
        if npm_path:
            break
    return npm_path


def main():
    global backend, frontend

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # ── Check dependencies ──
    print("🔍 检查环境...")

    # Check npm
    npm = find_npm()
    if not npm:
        print("❌ 未找到 npm，请先安装 Node.js")
        sys.exit(1)
    print(f"   ✅ npm ({npm})")

    try:
        subprocess.run([npm, "--version"], capture_output=True, check=True)
    except subprocess.CalledProcessError:
        print("❌ npm 运行异常")
        sys.exit(1)

    # Check node_modules
    if not (CLIENT_DIR / "node_modules").exists():
        print("📦 安装前端依赖...")
        subprocess.run([npm, "install"], cwd=CLIENT_DIR, check=True)

    # Check Python packages
    try:
        import fastapi, uvicorn, openai, sqlalchemy  # noqa: F401
    except ImportError:
        print("📦 安装后端依赖...")
        subprocess.run(
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
            cwd=SERVER_DIR,
            check=True,
        )

    # ── Start backend ──
    if LAN_MODE:
        print(f"🚀 启动后端 (FastAPI) http://0.0.0.0:58000 (局域网模式)...")
    else:
        print("🚀 启动后端 (FastAPI) http://localhost:58000 ...")
    kill_port(58000)
    uvicorn_args = [sys.executable, "-m", "uvicorn", "main:app", "--port", "58000"]
    if LAN_MODE:
        uvicorn_args += ["--host", "0.0.0.0"]
    backend = subprocess.Popen(
        uvicorn_args,
        cwd=SERVER_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    # ── Start frontend ──
    if LAN_MODE:
        print("🎨 启动前端 (Vite) http://0.0.0.0:5173 (局域网模式)...")
    else:
        print("🎨 启动前端 (Vite) http://localhost:5173 ...")
    npx = npm.replace("npm", "npx")  # same dir
    frontend = subprocess.Popen(
        [npx, "vite", "--host"],
        cwd=CLIENT_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    # ── Wait for servers & open browser ──
    time.sleep(4)

    if LAN_MODE:
        lan_ip = get_lan_ip()
        lan_url = f"http://{lan_ip}:5173"
        print(f"🌐 局域网地址: {lan_url}")
        print(f"   本地访问: http://localhost:5173")
        print(f"   分享 {lan_url} 给局域网其他人即可使用")
        webbrowser.open(lan_url)
    else:
        print("🌐 打开浏览器...")
        webbrowser.open("http://localhost:5173")

    # ── Print live output ──
    print("\n" + "=" * 50)
    if LAN_MODE:
        print("✅ 全部就绪（局域网模式）！按 Ctrl+C 停止")
    else:
        print("✅ 全部就绪！按 Ctrl+C 停止")
    print("=" * 50 + "\n")

    try:
        while True:
            for name, proc in [("后端", backend), ("前端", frontend)]:
                if proc and proc.poll() is not None:
                    remaining = proc.stdout.read() if proc.stdout else ""
                    if remaining:
                        print(f"[{name}] {remaining}")
                    print(f"❌ {name} 已退出 (code={proc.returncode})")
                    cleanup()
                    sys.exit(1)

                if proc and proc.stdout:
                    line = proc.stdout.readline()
                    if line:
                        # Filter noise, show key lines
                        line = line.strip()
                        if any(kw in line for kw in ["ERROR", "Error", "error"]):
                            print(f"[{name}] ❌ {line}")
                        elif any(
                            kw in line
                            for kw in [
                                "Uvicorn running",
                                "Application startup",
                                "Local:",
                                "ready in",
                            ]
                        ):
                            print(f"[{name}] ✅ {line}")
                        elif any(
                            kw in line
                            for kw in [
                                "[Chat]",
                                "[Vision]",
                                "[Sticker]",
                            ]
                        ):
                            print(f"[{name}] ℹ️ {line}")

            time.sleep(0.3)
    except KeyboardInterrupt:
        pass
    finally:
        cleanup()


if __name__ == "__main__":
    main()
